import { AsyncLocalStorage } from 'node:async_hooks';

// ── Causal Context ──────────────────────────────────────────────────────────

const causalContext = new AsyncLocalStorage();

/**
 * Get the current causal parent ID from async context.
 * Returns null if we're at a root action.
 */
export function currentCause() {
  return causalContext.getStore()?.causeId ?? null;
}

/**
 * Run a function within a causal context, so any state changes
 * inside it are linked to the given cause node.
 */
export function withCause(causeId, fn) {
  return causalContext.run({ causeId }, fn);
}

// ── Chronicle Node ──────────────────────────────────────────────────────────

let nodeCounter = 0;

/**
 * Create a ChronicleNode from a state diff.
 *
 * @param {string} path     - PluresDB path that changed
 * @param {*}      before   - Previous value (null for creates)
 * @param {*}      after    - New value (null for deletes)
 * @param {string} [contextId] - Session/request context
 * @returns {ChronicleNode}
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
 */
export function createChronos(db, options = {}) {
  const { contextId = null, batchMs = 50, maxBatch = 100 } = options;
  const nodes = [];
  const edges = [];
  let pendingWrite = [];
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

      // Write causal edge
      if (node.cause) {
        edges.push({
          from: node.cause,
          to: node.id,
          type: 'causes',
          timestamp: node.timestamp,
        });
      }

      // Write context edge
      if (node.context) {
        edges.push({
          from: node.context,
          to: node.id,
          type: 'context',
          timestamp: node.timestamp,
        });
      }
    }

    // TODO: Write batch to PluresDB graph storage
    // For now, held in-memory for query
  }

  // ── Subscribe to unum/PluresDB changes ─────────────────────────────────

  let unsubscribe = null;

  function start() {
    if (!db || typeof db.on !== 'function') {
      throw new Error('Chronos requires a PluresDB instance with .on() subscription support');
    }

    // Track previous values for diff computation
    const previousValues = new Map();

    unsubscribe = db.on((data, key) => {
      const path = key ?? 'root';
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
    if (unsubscribe && typeof unsubscribe === 'function') {
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
   * @param {'backward'|'forward'} direction
   * @param {number} [maxDepth=10]
   */
  function trace(nodeId, { direction = 'backward', maxDepth = 10 } = {}) {
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
      const connected =
        direction === 'backward'
          ? edges.filter((e) => e.to === id && e.type === 'causes')
          : edges.filter((e) => e.from === id && e.type === 'causes');

      for (const edge of connected) {
        const nextId = direction === 'backward' ? edge.from : edge.to;
        queue.push({ id: nextId, depth: depth + 1 });
      }
    }

    return result;
  }

  /**
   * Get all nodes within a time range.
   */
  function range(startMs, endMs) {
    return nodes.filter((n) => n.timestamp >= startMs && n.timestamp <= endMs);
  }

  /**
   * Get all nodes for a given context (session/request).
   */
  function subgraph(ctxId) {
    const contextNodeIds = new Set(
      edges.filter((e) => e.type === 'context' && e.from === ctxId).map((e) => e.to)
    );
    return nodes.filter((n) => contextNodeIds.has(n.id));
  }

  /**
   * Get all nodes for a specific path.
   */
  function history(path) {
    return nodes.filter((n) => n.path === path).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Total chronicle stats.
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

export { withCause, currentCause, createNode };
