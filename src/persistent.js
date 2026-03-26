/**
 * Chronos PluresDB Writer — persists chronicle nodes and edges to PluresDB.
 *
 * Replaces the in-memory arrays with durable graph storage.
 * Uses PluresDB's CrdtStore for CRDT-based replication readiness.
 *
 * @module @plures/chronos/persistent
 */

/**
 * Create a PluresDB-backed chronicle writer.
 *
 * @param {object} db - PluresDB CrdtStore instance
 * @param {object} [options]
 * @param {string} [options.prefix='chronos:'] - Key prefix for chronicle nodes
 * @returns {object} PersistentWriter with writeBatch, queryRange, queryEdges, trace, history, stats
 *
 * @example
 * ```js
 * import { createPersistentWriter } from '@plures/chronos/persistent';
 * import { createChronicle } from '@plures/chronos/chronicle';
 *
 * const writer = createPersistentWriter(db, { prefix: 'app:chronicle:' });
 * const chronicle = createChronicle(db, { writer });
 *
 * // Nodes and edges are now persisted to PluresDB automatically
 *
 * // Query persisted nodes by time range
 * const recentNodes = writer.queryRange(Date.now() - 3_600_000, Date.now());
 *
 * // Check storage stats
 * console.log(writer.stats()); // { nodes: 42, edges: 18 }
 * ```
 */
export function createPersistentWriter(db, options = {}) {
  const { prefix = 'chronos:' } = options;
  const actor = 'chronos';

  /**
   * Write a batch of chronicle nodes and their edges to PluresDB.
   *
   * Each node is stored as a PluresDB record at `{prefix}{node.id}`.
   * Edges are stored as a sub-key: `{prefix}edge:{edge.from}:{edge.to}:{edge.type}`.
   *
   * @param {ChronicleNode[]} nodes
   * @param {ChronicleEdge[]} edges
   */
  function writeBatch(nodes, edges) {
    for (const node of nodes) {
      const key = `${prefix}${node.id}`;
      db.put(key, actor, {
        ...node,
        _type: 'chronicle_node',
      });
    }

    for (const edge of edges) {
      const key = `${prefix}edge:${edge.from}:${edge.to}:${edge.type}`;
      db.put(key, actor, {
        ...edge,
        _type: 'chronicle_edge',
      });
    }
  }

  /**
   * Query all chronicle nodes within a time range.
   *
   * @param {number} startMs - Start timestamp (inclusive)
   * @param {number} endMs   - End timestamp (inclusive)
   * @returns {object[]} Matching nodes sorted by timestamp
   */
  function queryRange(startMs, endMs) {
    const records = db.list();
    return records
      .filter(
        (r) =>
          r.data?._type === 'chronicle_node' &&
          r.data.timestamp >= startMs &&
          r.data.timestamp <= endMs
      )
      .map((r) => r.data)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Query all edges for a given node.
   *
   * @param {string} nodeId
   * @param {'causes'|'context'|'reverts'|'concurrent'} [edgeType]
   * @returns {object[]} Matching edges
   */
  function queryEdges(nodeId, edgeType) {
    const records = db.list();
    return records
      .filter((r) => {
        if (r.data?._type !== 'chronicle_edge') return false;
        const matchesNode = r.data.from === nodeId || r.data.to === nodeId;
        const matchesType = edgeType ? r.data.type === edgeType : true;
        return matchesNode && matchesType;
      })
      .map((r) => r.data);
  }

  /**
   * Trace causal chain from a node (persistent version).
   *
   * @param {string} nodeId
   * @param {'backward'|'forward'} direction
   * @param {number} [maxDepth=10]
   * @returns {object[]} Ordered list of ChronicleNodes from starting node to root cause (or effects)
   */
  function trace(nodeId, { direction = 'backward', maxDepth = 10 } = {}) {
    const result = [];
    const visited = new Set();
    const queue = [{ id: nodeId, depth: 0 }];
    const allRecords = db.list();

    // Index nodes and edges for efficient lookup
    const nodeMap = new Map();
    const edgeIndex = { forward: new Map(), backward: new Map() };

    for (const r of allRecords) {
      if (r.data?._type === 'chronicle_node') {
        nodeMap.set(r.data.id, r.data);
      } else if (r.data?._type === 'chronicle_edge' && r.data.type === 'causes') {
        // forward: from → [to]
        if (!edgeIndex.forward.has(r.data.from)) edgeIndex.forward.set(r.data.from, []);
        edgeIndex.forward.get(r.data.from).push(r.data.to);
        // backward: to → [from]
        if (!edgeIndex.backward.has(r.data.to)) edgeIndex.backward.set(r.data.to, []);
        edgeIndex.backward.get(r.data.to).push(r.data.from);
      }
    }

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const node = nodeMap.get(id);
      if (node) result.push(node);

      const neighbors =
        direction === 'backward'
          ? edgeIndex.backward.get(id) || []
          : edgeIndex.forward.get(id) || [];

      for (const nextId of neighbors) {
        queue.push({ id: nextId, depth: depth + 1 });
      }
    }

    return result;
  }

  /**
   * Get history for a specific path (all state changes over time).
   *
   * @param {string} path - PluresDB path to query
   * @returns {object[]} Matching nodes sorted by timestamp ascending
   */
  function history(path) {
    const records = db.list();
    return records
      .filter((r) => r.data?._type === 'chronicle_node' && r.data.path === path)
      .map((r) => r.data)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Count total nodes and edges in the persistent store.
   *
   * @returns {{ nodes: number, edges: number }}
   */
  function stats() {
    const records = db.list();
    let nodes = 0;
    let edges = 0;
    for (const r of records) {
      if (r.data?._type === 'chronicle_node') nodes++;
      else if (r.data?._type === 'chronicle_edge') edges++;
    }
    return { nodes, edges };
  }

  return {
    writeBatch,
    queryRange,
    queryEdges,
    trace,
    history,
    stats,
  };
}
