/**
 * Chronicle Query API
 *
 * Pure, composable query functions for filtering chronicle nodes by time
 * range, state path, or context. All functions accept plain arrays of
 * ChronicleNode / ChronicleEdge objects so they work equally well with
 * in-memory chronicle data and records loaded from the persistent writer.
 *
 * For causal-chain traversal see `@plures/chronos/trace`.
 */

// ── Individual filter helpers ────────────────────────────────────────────────

/**
 * Return all nodes whose timestamp falls within [startMs, endMs] (inclusive).
 *
 * @param {object[]} nodes
 * @param {number}   startMs - Start of range (Unix ms, inclusive)
 * @param {number}   endMs   - End of range (Unix ms, inclusive)
 * @returns {object[]} Sorted by timestamp ascending
 */
export function queryByTimeRange(nodes, startMs, endMs) {
  return nodes
    .filter((n) => n.timestamp >= startMs && n.timestamp <= endMs)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Return all nodes recorded at an exact path, sorted by timestamp ascending.
 *
 * @param {object[]} nodes
 * @param {string}   path  - Exact PluresDB path to match (e.g. `'todos.abc'`)
 * @returns {object[]}
 */
export function queryByPath(nodes, path) {
  return nodes
    .filter((n) => n.path === path)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Return all nodes whose path starts with the given prefix.
 *
 * Useful for querying an entire sub-tree, e.g. all changes under `'todos'`
 * will match paths like `'todos.1'`, `'todos.2.text'`, etc.
 *
 * @param {object[]} nodes
 * @param {string}   prefix - Path prefix (the separator `'.'` is NOT added
 *                            automatically, so `'todos'` also matches `'todosExtra'`).
 *                            Pass `'todos.'` to strictly scope to sub-paths.
 * @returns {object[]} Sorted by timestamp ascending
 */
export function queryByPathPrefix(nodes, prefix) {
  return nodes
    .filter((n) => n.path.startsWith(prefix))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Return all nodes that belong to a session / request context.
 *
 * Context membership is determined by the presence of a `'context'` edge
 * from `contextId` to the node, **or** by the node's own `context` field
 * matching `contextId` (whichever is populated).
 *
 * @param {object[]} nodes
 * @param {object[]} edges
 * @param {string}   contextId
 * @returns {object[]} Sorted by timestamp ascending
 */
export function queryByContext(nodes, edges, contextId) {
  const memberIds = new Set(
    edges
      .filter((e) => e.type === 'context' && e.from === contextId)
      .map((e) => e.to)
  );

  return nodes
    .filter((n) => memberIds.has(n.id) || n.context === contextId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ── Composable multi-filter ──────────────────────────────────────────────────

/**
 * Run one or more filters over a set of chronicle nodes in a single pass.
 *
 * All supplied filters are applied with logical AND (intersection).
 * Omitted options are ignored (no filtering on that dimension).
 *
 * @param {object[]} nodes
 * @param {object[]} edges  - Required only when `contextId` is supplied
 * @param {object}   [options]
 * @param {number}   [options.startMs]    - Lower timestamp bound (inclusive)
 * @param {number}   [options.endMs]      - Upper timestamp bound (inclusive)
 * @param {string}   [options.path]       - Exact path match
 * @param {string}   [options.pathPrefix] - Path prefix match (applied when
 *                                          `path` is not supplied)
 * @param {string}   [options.contextId]  - Session / request context filter
 * @param {number}   [options.limit]      - Maximum number of results to return
 * @param {number}   [options.offset]     - Number of results to skip (pagination)
 * @returns {object[]} Sorted by timestamp ascending
 */
export function query(nodes, edges = [], {
  startMs,
  endMs,
  path,
  pathPrefix,
  contextId,
  limit,
  offset,
} = {}) {
  // Build a context membership set once (avoid per-node edge scan)
  let contextIds = null;
  if (contextId !== undefined) {
    contextIds = new Set(
      edges
        .filter((e) => e.type === 'context' && e.from === contextId)
        .map((e) => e.to)
    );
  }

  let results = nodes.filter((n) => {
    if (startMs !== undefined && n.timestamp < startMs) return false;
    if (endMs !== undefined && n.timestamp > endMs) return false;
    if (path !== undefined && n.path !== path) return false;
    if (path === undefined && pathPrefix !== undefined && !n.path.startsWith(pathPrefix)) return false;
    if (contextIds !== null && !contextIds.has(n.id) && n.context !== contextId) return false;
    return true;
  });

  results = results.sort((a, b) => a.timestamp - b.timestamp);

  if (offset !== undefined && offset > 0) results = results.slice(offset);
  if (limit !== undefined && limit > 0) results = results.slice(0, limit);

  return results;
}
