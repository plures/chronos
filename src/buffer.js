/**
 * Rolling Buffer — 5-second verbose capture with error-triggered flush.
 *
 * The buffer captures ALL writes regardless of log level into a bounded
 * ring. On error, the entire window is flushed to the sink. On no error,
 * entries are silently overwritten — zero disk cost in the happy path.
 *
 * The buffer lives in memory (not PluresDB state namespace) because:
 * - It's ephemeral by design — survival across restarts is not a goal
 * - It must be fast — no serialization overhead on every write
 * - It has a fixed size — ring buffer with O(1) insert and O(n) flush
 *
 * @module @plures/chronos/buffer
 */

import { createChronicleNode } from "./chronicle.js";

/**
 * @typedef {object} BufferEntry
 * @property {number} timestamp  - When the write occurred
 * @property {string} key        - PluresDB key
 * @property {*}      before     - Previous value
 * @property {*}      after      - New value
 * @property {string|null} cause - Causal parent ID
 * @property {string|null} context - Session context
 */

/**
 * @typedef {object} BufferConfig
 * @property {number} [windowMs=5000]   - Rolling window duration in ms
 * @property {number} [maxEntries=1000] - Max entries in the ring (hard cap)
 */

/**
 * Create a rolling buffer instance.
 *
 * @param {BufferConfig} [config]
 * @returns {object} RollingBuffer with push, flush, drain, stats, clear
 *
 * @example
 * ```js
 * import { createRollingBuffer } from '@plures/chronos/buffer';
 *
 * const buffer = createRollingBuffer({ windowMs: 5000 });
 *
 * // Every write goes into the buffer
 * buffer.push({ key: 'agent:tool:search', before: null, after: { query: 'foo' } });
 *
 * // On error — flush the entire window
 * const entries = buffer.flush();
 * // entries = all writes from the last 5 seconds
 *
 * // Normal operation — old entries silently expire
 * // Zero disk cost, zero file writes
 * ```
 */
export function createRollingBuffer(config = {}) {
  const { windowMs = 5000, maxEntries = 1000 } = config;

  /** @type {BufferEntry[]} */
  let ring = new Array(maxEntries);
  let head = 0;
  let count = 0;
  let frozen = false;

  /**
   * Push a write into the ring buffer.
   * If the buffer is frozen (during flush), writes are silently dropped.
   *
   * @param {object} entry
   * @param {string} entry.key       - PluresDB key
   * @param {*}      entry.before    - Previous value
   * @param {*}      entry.after     - New value
   * @param {string|null} [entry.cause]   - Causal parent
   * @param {string|null} [entry.context] - Session context
   */
  function push(entry) {
    if (frozen) return;

    const slot = {
      timestamp: Date.now(),
      key: entry.key,
      before: entry.before,
      after: entry.after,
      cause: entry.cause ?? null,
      context: entry.context ?? null,
    };

    ring[head] = slot;
    head = (head + 1) % maxEntries;
    if (count < maxEntries) count++;
  }

  /**
   * Prune entries older than the window. Called internally before reads.
   */
  function prune() {
    const cutoff = Date.now() - windowMs;
    // Only prune from the oldest entries
    const entries = drain();
    const kept = entries.filter((e) => e.timestamp >= cutoff);
    // Re-insert kept entries
    clear();
    for (const e of kept) {
      ring[head] = e;
      head = (head + 1) % maxEntries;
      count++;
    }
  }

  /**
   * Drain all entries from the buffer in chronological order.
   * Does NOT clear the buffer — use `clear()` after if needed.
   *
   * @returns {BufferEntry[]} All entries, oldest first
   */
  function drain() {
    if (count === 0) return [];

    const result = [];
    const start = (head - count + maxEntries) % maxEntries;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % maxEntries;
      if (ring[idx]) result.push(ring[idx]);
    }
    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Flush the buffer — freeze, drain all entries within the window,
   * clear, and unfreeze. This is the error-triggered path.
   *
   * Returns all entries from the last `windowMs` milliseconds as
   * ChronicleNodes ready for the sink.
   *
   * @param {string} [errorContext] - Optional error ID to attach as cause
   * @returns {import('./chronicle.js').ChronicleNode[]} Chronicle nodes
   */
  function flush(errorContext) {
    frozen = true;

    const cutoff = Date.now() - windowMs;
    const entries = drain().filter((e) => e.timestamp >= cutoff);

    const nodes = entries.map((e) =>
      createChronicleNode(e.key, e.before, e.after, e.context)
    );

    clear();
    frozen = false;

    return nodes;
  }

  /**
   * Clear all entries.
   */
  function clear() {
    ring = new Array(maxEntries);
    head = 0;
    count = 0;
  }

  /**
   * Buffer statistics.
   *
   * @returns {{ count: number, maxEntries: number, windowMs: number, frozen: boolean }}
   */
  function stats() {
    return { count, maxEntries, windowMs, frozen };
  }

  return {
    push,
    flush,
    drain,
    clear,
    stats,
  };
}
