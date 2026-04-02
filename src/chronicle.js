/**
 * Chronicle — canonical implementation.
 *
 * Wraps a PluresDB instance and records all state changes as a causal graph
 * with minimal JSON diffs. Prefer this over the main entry point for new projects.
 *
 * @module @plures/chronos/chronicle
 */

import { currentCause, withCause } from "./causal.js";
import { computeDiff } from "./diff.js";

// ── Chronicle Node ───────────────────────────────────────────────────────────

let _nodeCounter = 0;

/**
 * @typedef {object} ChronicleNode
 * @property {string}      id        - Unique node ID (`chrono:{timestamp}-{counter}`)
 * @property {number}      timestamp - Unix timestamp in milliseconds
 * @property {string}      path      - PluresDB path that changed
 * @property {object}      diff      - Diff descriptor
 * @property {*}           diff.before  - Previous value (null for creates)
 * @property {*}           diff.after   - New value (null for deletes)
 * @property {DiffDescriptor|null} [diff.minimal] - Minimal structural diff
 * @property {string|null} cause     - ID of the causal parent node, or null
 * @property {string|null} context   - Session / request context ID, or null
 */

/**
 * @typedef {object} ChronicleEdge
 * @property {string} from      - Source node ID
 * @property {string} to        - Target node ID
 * @property {'causes'|'context'|'reverts'|'concurrent'} type - Edge type
 * @property {number} timestamp - Unix timestamp in milliseconds
 */

/**
 * Create a ChronicleNode from a state diff.
 *
 * The node's `diff` field contains both the full before/after values **and**
 * a `minimal` descriptor produced by the diff engine (see `computeDiff`).
 *
 * @param {string} path       - PluresDB path that changed
 * @param {*}      before     - Previous value (null for creates)
 * @param {*}      after      - New value (null for deletes)
 * @param {string} [contextId] - Session / request context ID
 * @returns {object} ChronicleNode
 *
 * @example
 * ```js
 * import { createChronicleNode } from '@plures/chronos/chronicle';
 *
 * const node = createChronicleNode('todos.1', null, { text: 'buy milk' }, 'session:abc');
 * console.log(node.id);        // 'chrono:1699000000000-1'
 * console.log(node.diff.before); // null
 * console.log(node.diff.after);  // { text: 'buy milk' }
 * console.log(node.context);     // 'session:abc'
 * ```
 */
export function createChronicleNode(path, before, after, contextId) {
  return {
    id: `chrono:${Date.now()}-${++_nodeCounter}`,
    timestamp: Date.now(),
    path,
    diff: {
      before,
      after,
      minimal: computeDiff(before, after),
    },
    cause: currentCause(),
    context: contextId ?? null,
  };
}

// ── createChronicle ──────────────────────────────────────────────────────────

/**
 * Create a Chronicle instance that wraps a PluresDB instance and records
 * all state changes as a causal graph with minimal JSON diffs.
 *
 * @param {object} db        - PluresDB instance (must support `.on()` subscriptions)
 * @param {object} [options]
 * @param {string} [options.contextId]  - Default context applied to all captured nodes
 * @param {number} [options.debounceMs] - When > 0, coalesce rapid changes per path into
 *                                        a single node using this debounce window (ms).
 *                                        Default: 0 (capture every change).
 * @param {number} [options.maxBatch]   - Max nodes flushed per tick (default: 100)
 * @param {object} [options.writer]     - Optional persistent writer
 *                                        (e.g. from `createPersistentWriter`)
 * @returns {object} ChronicleInstance with start, stop, flush, trace, range, subgraph, history, stats
 *
 * @example
 * ```js
 * import { createChronicle } from '@plures/chronos/chronicle';
 *
 * const chronicle = createChronicle(db, {
 *   contextId: 'session:abc',
 *   debounceMs: 100,
 * });
 *
 * // Query history for a path
 * const history = chronicle.history('todos.1');
 * // → [{ id, timestamp, path, diff: { before: null, after: { text: 'buy milk' } }, ... }]
 *
 * // Walk the causal chain
 * const causes = chronicle.trace(nodeId, { direction: 'backward' });
 *
 * chronicle.stop();
 * ```
 */
export function createChronicle(db, options = {}) {
  const { contextId = null, debounceMs = 0, maxBatch = 100, writer = null } =
    options;

  const nodes = [];
  const edges = [];
  const pendingWrite = [];
  let flushTimer = null;
  let unsubscribe = null;

  /** path → last-seen value (for before/after tracking) */
  const previousValues = new Map();

  /**
   * Debounce state per path when `debounceMs > 0`.
   * path → { originalBefore, latestAfter, cause, timer }
   */
  const _debounce = new Map();

  // ── Flush / batch write ─────────────────────────────────────────────────

  function _scheduleBatchWrite() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      _flush();
      flushTimer = null;
    }, 0);
  }

  function _flush() {
    if (pendingWrite.length === 0) return;
    const batch = pendingWrite.splice(0, maxBatch);

    for (const node of batch) {
      nodes.push(node);
      const batchEdges = [];

      if (node.cause) {
        const edge = {
          from: node.cause,
          to: node.id,
          type: "causes",
          timestamp: node.timestamp,
        };
        edges.push(edge);
        batchEdges.push(edge);
      }

      if (node.context) {
        const edge = {
          from: node.context,
          to: node.id,
          type: "context",
          timestamp: node.timestamp,
        };
        edges.push(edge);
        batchEdges.push(edge);
      }

      if (writer) writer.writeBatch([node], batchEdges);
    }
  }

  // ── Change handler ──────────────────────────────────────────────────────

  function _handleChange(data, key) {
    const path = key ?? "root";
    const before = previousValues.get(path) ?? null;
    const after = data;

    // Skip no-op updates (computeDiff returns null for identical values)
    if (computeDiff(before, after) === null) return;

    previousValues.set(path, structuredClone(after));

    if (debounceMs > 0) {
      _handleDebounced(path, before, after);
    } else {
      pendingWrite.push(createChronicleNode(path, before, after, contextId));
      _scheduleBatchWrite();
    }
  }

  function _handleDebounced(path, before, after) {
    const existing = _debounce.get(path);

    if (existing) {
      // Extend the window; keep the original `before` and capture cause from first change
      clearTimeout(existing.timer);
      existing.latestAfter = after;
    } else {
      _debounce.set(path, {
        originalBefore: before,
        latestAfter: after,
        // Capture causal context at the time of the first change in the window
        cause: currentCause(),
        timer: null,
      });
    }

    const state = _debounce.get(path);
    state.timer = setTimeout(() => {
      // Build the node inside the original causal context
      const node = withCause(
        state.cause,
        () =>
          createChronicleNode(
            path,
            state.originalBefore,
            state.latestAfter,
            contextId,
          ),
      );
      pendingWrite.push(node);
      _scheduleBatchWrite();
      _debounce.delete(path);
    }, debounceMs);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  function start() {
    if (!db || typeof db.on !== "function") {
      throw new Error(
        "createChronicle requires a PluresDB instance with .on() subscription support",
      );
    }
    if (unsubscribe) return; // already started
    unsubscribe = db.on(_handleChange);
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    // Flush any pending debounce windows immediately
    for (const [path, state] of _debounce) {
      clearTimeout(state.timer);
      const node = withCause(
        state.cause,
        () =>
          createChronicleNode(
            path,
            state.originalBefore,
            state.latestAfter,
            contextId,
          ),
      );
      pendingWrite.push(node);
    }
    _debounce.clear();

    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    _flush();
  }

  // Alias for consumers that want an explicit flush (e.g. in tests)
  function flush() {
    _flush();
  }

  // ── Query API ───────────────────────────────────────────────────────────

  /**
   * Traverse the causal graph from a node.
   *
   * @param {string} nodeId
   * @param {'backward'|'forward'} [direction='backward']
   * @param {number} [maxDepth=10]
   * @returns {object[]} Ordered list of ChronicleNodes
   */
  function trace(nodeId, { direction = "backward", maxDepth = 10 } = {}) {
    const result = [];
    const visited = new Set();
    const queue = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const node = nodes.find((n) => n.id === id);
      if (node) result.push(node);

      const connected = direction === "backward"
        ? edges.filter((e) => e.to === id && e.type === "causes")
        : edges.filter((e) => e.from === id && e.type === "causes");

      for (const edge of connected) {
        queue.push({
          id: direction === "backward" ? edge.from : edge.to,
          depth: depth + 1,
        });
      }
    }

    return result;
  }

  /**
   * Return all nodes within a timestamp range (inclusive).
   *
   * @param {number} startMs - Start timestamp (inclusive)
   * @param {number} endMs   - End timestamp (inclusive)
   * @returns {object[]} Matching nodes
   */
  function range(startMs, endMs) {
    return nodes.filter((n) => n.timestamp >= startMs && n.timestamp <= endMs);
  }

  /**
   * Return all nodes belonging to a context (session / request).
   *
   * @param {string} ctxId - Context ID
   * @returns {object[]} Nodes belonging to the context
   */
  function subgraph(ctxId) {
    const ids = new Set(
      edges.filter((e) => e.type === "context" && e.from === ctxId).map((e) =>
        e.to
      ),
    );
    return nodes.filter((n) => ids.has(n.id));
  }

  /**
   * Return all changes for a path, ordered by timestamp.
   *
   * @param {string} path - PluresDB path to query
   * @returns {object[]} Nodes sorted by timestamp ascending
   */
  function history(path) {
    return nodes.filter((n) => n.path === path).sort((a, b) =>
      a.timestamp - b.timestamp
    );
  }

  /**
   * Summary counters.
   *
   * @returns {{ nodes: number, edges: number, pending: number }}
   */
  function stats() {
    return {
      nodes: nodes.length,
      edges: edges.length,
      pending: pendingWrite.length,
    };
  }

  // Auto-start when created
  start();

  return {
    start,
    stop,
    flush,
    trace,
    range,
    subgraph,
    history,
    stats,
    // Exposed for testing / debugging
    _nodes: nodes,
    _edges: edges,
  };
}

/**
 * Run a function within a causal context so that all nodes created during
 * execution carry `causeId` as their causal parent.
 *
 * Re-exported from `@plures/chronos/causal` for convenience.
 *
 * @param {string}   causeId - ID of the parent node to set as the active cause
 * @param {Function} fn      - Synchronous or async function to execute inside the scope
 * @returns {*} The return value of `fn`
 *
 * @example
 * ```js
 * import { withCause } from '@plures/chronos/chronicle';
 *
 * withCause('chrono:1699000000000-1', () => {
 *   // All chronicle nodes created here carry the causeId
 * });
 * ```
 */
export { withCause };

/**
 * Get the current causal parent ID.
 *
 * Re-exported from `@plures/chronos/causal` for convenience.
 *
 * @returns {string|null} The active causal parent ID, or `null` outside a causal scope.
 *
 * @example
 * ```js
 * import { currentCause } from '@plures/chronos/chronicle';
 *
 * console.log(currentCause()); // null (outside any causal scope)
 * ```
 */
export { currentCause };
