/**
 * Chronicle Causal-Chain Traversal
 *
 * Pure utility functions for walking causal graphs from a set of chronicle
 * nodes and edges. Works identically for in-memory chronicle data and data
 * loaded from the persistent PluresDB writer.
 */

/**
 * Walk the causal graph starting from a given node.
 *
 * @param {object[]} nodes     - Array of ChronicleNode objects to search
 * @param {object[]} edges     - Array of ChronicleEdge objects to traverse
 * @param {string}   nodeId    - ID of the starting node
 * @param {object}   [options]
 * @param {'backward'|'forward'} [options.direction='backward']
 *   `'backward'` follows `causes` edges toward the root cause;
 *   `'forward'`  follows `causes` edges toward downstream effects.
 * @param {number} [options.maxDepth=10]
 *   Maximum number of hops from the starting node.
 * @param {string} [options.edgeType='causes']
 *   Edge type to follow. Defaults to `'causes'`; pass `'context'` to walk
 *   the session/request subgraph instead.
 * @returns {object[]} Ordered list of ChronicleNodes starting from nodeId.
 */
export function traceCausalChain(nodes, edges, nodeId, {
  direction = 'backward',
  maxDepth = 10,
  edgeType = 'causes',
} = {}) {
  // Build lookup structures for O(1) node resolution and O(degree) edge traversal
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  /** @type {Map<string, string[]>} */
  const forwardIndex = new Map(); // from → [to]
  /** @type {Map<string, string[]>} */
  const backwardIndex = new Map(); // to → [from]

  for (const edge of edges) {
    if (edge.type !== edgeType) continue;

    if (!forwardIndex.has(edge.from)) forwardIndex.set(edge.from, []);
    forwardIndex.get(edge.from).push(edge.to);

    if (!backwardIndex.has(edge.to)) backwardIndex.set(edge.to, []);
    backwardIndex.get(edge.to).push(edge.from);
  }

  const result = [];
  const visited = new Set();
  const queue = [{ id: nodeId, depth: 0 }];
  let head = 0; // read index — avoids O(n) Array.shift()

  while (head < queue.length) {
    const { id, depth } = queue[head++];
    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (node) result.push(node);

    const neighbors =
      direction === 'backward'
        ? backwardIndex.get(id) ?? []
        : forwardIndex.get(id) ?? [];

    for (const nextId of neighbors) {
      queue.push({ id: nextId, depth: depth + 1 });
    }
  }

  return result;
}
