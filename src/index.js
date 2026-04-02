/**
 * Chronos — main entry point (legacy).
 *
 * For new projects, prefer `@plures/chronos/chronicle`.
 *
 * @module @plures/chronos
 */

import { currentCause, withCause } from "./causal.js";

// ── Chronicle Node ──────────────────────────────────────────────────────────

let nodeCounter = 0;

/**
 * Create a ChronicleNode from a state diff.
 *
 * @param {string} path     - PluresDB path that changed
 * @param {*}      before   - Previous value (null for creates)
 * @param {*}      after    - New value (null for deletes)
 * @param {string} [contextId] - Session/request context
 * @returns {ChronicleNode} The newly created chronicle node
 *
 * @example
 * ```js
 * import { createNode } from '@plures/chronos';
 *
 * const node = createNode('todos.1', null, { text: 'buy milk' }, 'session:abc');
 * console.log(node.id);        // 'chrono:1699000000000-1'
 * console.log(node.diff);      // { before: null, after: { text: 'buy milk' } }
 * console.log(node.context);   // 'session:abc'
 * ```
 */
export function createNode(path, before, after, contextId) {
  return {
    id: `chrono:${Date.now()}-${++nodeCounter}`,
    timestamp: Date.now(),
    path,
    diff: { before, after },
    cause: currentCause(),
    context: contextId ?? null,
  };
}

// ── Chronos Core ────────────────────────────────────────────────────────────

/**
 * Create a Chronos instance that subscribes to a PluresDB instance
 * and records all state changes as a graph.
 *
 * @param {object} db        - PluresDB instance (must support .on() subscriptions)
 * @param {object} [options]
 * @param {string} [options.contextId] - Default context for all nodes
 * @param {number} [options.batchMs]   - Batch write interval (default: 50ms)
 * @param {number} [options.maxBatch]  - Max nodes per batch (default: 100)
 * @param {object} [options.writer]    - Persistent writer (from createPersistentWriter)
 * @returns {object} ChronosInstance with start, stop, flush, trace, range, subgraph, history, stats
 *
 * @example
 * ```js
 * import { createChronos } from '@plures/chronos';
 *
 * const chronicle = createChronos(db, { contextId: 'session:abc' });
 *
 * // Query history
 * const history = chronicle.history('todos.1');
 * // → [{ id, timestamp, path, diff: { before: null, after: { text: 'buy milk' } }, ... }]
 *
 * chronicle.stop();
 * ```
 */
export function createChronos(db, options = {}) {
  const { contextId = null, batchMs = 50, maxBatch = 100, writer = null } =
    options;
  const nodes = [];
  const edges = [];
  const pendingWrite = [];
  let flushTimer = null;

  // ── Batch writer ────────────────────────────────────────────────────────

  function scheduleBatchWrite() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flush();
      flushTimer = null;
    }, batchMs);
  }

  function flush() {
    if (pendingWrite.length === 0) return;
    const batch = pendingWrite.splice(0, maxBatch);

    for (const node of batch) {
      nodes.push(node);

      // Build edges
      const batchEdges = [];

      // Write causal edge
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

      // Write context edge
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

      // Persist if writer is available
      if (writer) {
        writer.writeBatch([node], batchEdges);
      }
    }
  }

  // ── Subscribe to unum/PluresDB changes ─────────────────────────────────

  let unsubscribe = null;

  function start() {
    if (!db || typeof db.on !== "function") {
      throw new Error(
        "Chronos requires a PluresDB instance with .on() subscription support",
      );
    }

    // Track previous values for diff computation
    const previousValues = new Map();

    unsubscribe = db.on((data, key) => {
      const path = key ?? "root";
      const before = previousValues.get(path) ?? null;
      const after = data;

      // Skip if no actual change
      if (JSON.stringify(before) === JSON.stringify(after)) return;

      previousValues.set(path, structuredClone(after));

      const node = createNode(path, before, after, contextId);
      pendingWrite.push(node);
      scheduleBatchWrite();
    });
  }

  function stop() {
    if (unsubscribe && typeof unsubscribe === "function") {
      unsubscribe();
    }
    if (flushTimer) {
      clearTimeout(flushTimer);
      flush(); // Final flush
    }
  }

  // ── Query API ───────────────────────────────────────────────────────────

  /**
   * Trace causality from a node.
   * @param {string} nodeId - Starting node
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

      // Find connected edges
      const connected = direction === "backward"
        ? edges.filter((e) => e.to === id && e.type === "causes")
        : edges.filter((e) => e.from === id && e.type === "causes");

      for (const edge of connected) {
        const nextId = direction === "backward" ? edge.from : edge.to;
        queue.push({ id: nextId, depth: depth + 1 });
      }
    }

    return result;
  }

  /**
   * Get all nodes within a time range.
   *
   * @param {number} startMs - Start timestamp (inclusive)
   * @param {number} endMs   - End timestamp (inclusive)
   * @returns {object[]} Matching nodes
   */
  function range(startMs, endMs) {
    return nodes.filter((n) => n.timestamp >= startMs && n.timestamp <= endMs);
  }

  /**
   * Get all nodes for a given context (session/request).
   *
   * @param {string} ctxId - Context ID
   * @returns {object[]} Nodes belonging to the context
   */
  function subgraph(ctxId) {
    const contextNodeIds = new Set(
      edges.filter((e) => e.type === "context" && e.from === ctxId).map((e) =>
        e.to
      ),
    );
    return nodes.filter((n) => contextNodeIds.has(n.id));
  }

  /**
   * Get all nodes for a specific path.
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
   * Total chronicle stats.
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

  // ── Public API ──────────────────────────────────────────────────────────

  // Auto-start on creation
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
    // Expose for testing
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
 * import { withCause } from '@plures/chronos';
 *
 * withCause('chrono:1699000000000-1', () => {
 *   // All nodes created here carry the causeId
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
 * import { currentCause } from '@plures/chronos';
 *
 * console.log(currentCause()); // null (outside any causal scope)
 * ```
 */
export { currentCause };
