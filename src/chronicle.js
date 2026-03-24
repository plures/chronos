import { currentCause, withCause } from './causal.js';
import { computeDiff } from './diff.js';

// ── Chronicle Node ───────────────────────────────────────────────────────────

let _nodeCounter = 0;

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
 */
export function createChronicle(db, options = {}) {
  const { contextId = null, debounceMs = 0, maxBatch = 100, writer = null } = options;

  const nodes = [];
  const edges = [];
  let pendingWrite = [];
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
        const edge = { from: node.cause, to: node.id, type: 'causes', timestamp: node.timestamp };
        edges.push(edge);
        batchEdges.push(edge);
      }

      if (node.context) {
        const edge = { from: node.context, to: node.id, type: 'context', timestamp: node.timestamp };
        edges.push(edge);
        batchEdges.push(edge);
      }

      if (writer) writer.writeBatch([node], batchEdges);
    }
  }

  // ── Change handler ──────────────────────────────────────────────────────

  function _handleChange(data, key) {
    const path = key ?? 'root';
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
      const node = withCause(state.cause, () =>
        createChronicleNode(path, state.originalBefore, state.latestAfter, contextId)
      );
      pendingWrite.push(node);
      _scheduleBatchWrite();
      _debounce.delete(path);
    }, debounceMs);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  function start() {
    if (!db || typeof db.on !== 'function') {
      throw new Error(
        'createChronicle requires a PluresDB instance with .on() subscription support'
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
      const node = withCause(state.cause, () =>
        createChronicleNode(path, state.originalBefore, state.latestAfter, contextId)
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

      const connected =
        direction === 'backward'
          ? edges.filter((e) => e.to === id && e.type === 'causes')
          : edges.filter((e) => e.from === id && e.type === 'causes');

      for (const edge of connected) {
        queue.push({ id: direction === 'backward' ? edge.from : edge.to, depth: depth + 1 });
      }
    }

    return result;
  }

  /** Return all nodes within a timestamp range (inclusive). */
  function range(startMs, endMs) {
    return nodes.filter((n) => n.timestamp >= startMs && n.timestamp <= endMs);
  }

  /** Return all nodes belonging to a context (session / request). */
  function subgraph(ctxId) {
    const ids = new Set(
      edges.filter((e) => e.type === 'context' && e.from === ctxId).map((e) => e.to)
    );
    return nodes.filter((n) => ids.has(n.id));
  }

  /** Return all changes for a path, ordered by timestamp. */
  function history(path) {
    return nodes.filter((n) => n.path === path).sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Summary counters. */
  function stats() {
    return { nodes: nodes.length, edges: edges.length, pending: pendingWrite.length };
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

export { withCause, currentCause };
