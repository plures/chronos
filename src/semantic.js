/**
 * Chronos Semantic Search — vector-based search over chronicle state changes.
 *
 * Uses PluresDB's vector search capabilities to enable natural language
 * queries over state history: "what changed in the user profile?"
 *
 * Requires an embedding function to convert state diffs to vectors.
 *
 * @module @plures/chronos/semantic
 */

/**
 * Create a semantic search index over chronicle nodes.
 *
 * @param {object} db - PluresDB CrdtStore instance (for persistent nodes)
 * @param {object} options
 * @param {function} options.embed - async (text: string) => number[] — embedding function
 * @param {string} [options.prefix='chronos:'] - Key prefix for chronicle nodes
 * @param {number} [options.dimensions=384] - Vector dimensions (must match embed output)
 * @returns {object} SemanticIndex with indexNode, indexBatch, indexAll, search, searchAndTrace, stats
 *
 * @example
 * ```js
 * import { createSemanticIndex } from '@plures/chronos/semantic';
 *
 * // Supply an embedding function (e.g. from a local model or API)
 * const embed = async (text) => myEmbeddingModel.encode(text);
 *
 * const index = createSemanticIndex(db, { embed, dimensions: 384 });
 *
 * // Index all persisted chronicle nodes
 * const count = await index.indexAll();
 * console.log(`Indexed ${count} nodes`);
 *
 * // Search by natural language
 * const results = await index.search('what changed in the user profile?', { topK: 5 });
 * results.forEach(({ node, score }) => {
 *   console.log(score.toFixed(3), node.path, node.diff.after);
 * });
 *
 * // Search and trace causal chains for top matches
 * const traced = await index.searchAndTrace('recent authentication changes', { topK: 3 });
 * ```
 */
export function createSemanticIndex(db, options = {}) {
  const { embed, prefix = 'chronos:', dimensions = 384 } = options;

  if (typeof embed !== 'function') {
    throw new Error('SemanticIndex requires an embed function: async (text) => number[]');
  }

  // In-memory vector store (brute-force kNN for MVP)
  const vectors = new Map(); // nodeId → { vector, text, node }

  /**
   * Convert a chronicle node's diff into searchable text.
   *
   * @param {object} node - ChronicleNode to convert
   * @returns {string} Human-readable text representation of the diff
   */
  function diffToText(node) {
    const parts = [`path:${node.path}`];
    const { before, after } = node.diff || {};

    if (before === null && after !== null) {
      parts.push(`created: ${JSON.stringify(after)}`);
    } else if (before !== null && after === null) {
      parts.push(`deleted: ${JSON.stringify(before)}`);
    } else {
      parts.push(`changed from ${JSON.stringify(before)} to ${JSON.stringify(after)}`);
    }

    if (node.context) parts.push(`context:${node.context}`);
    return parts.join(' | ');
  }

  /**
   * Cosine similarity between two vectors.
   *
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Cosine similarity score in the range [0, 1]
   */
  function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Index a single chronicle node.
   *
   * @param {object} node - ChronicleNode to index
   * @returns {Promise<void>}
   */
  async function indexNode(node) {
    const text = diffToText(node);
    const vector = await embed(text);
    vectors.set(node.id, { vector, text, node });
  }

  /**
   * Index multiple nodes in batch.
   *
   * @param {object[]} nodes - Array of ChronicleNodes to index
   * @returns {Promise<void>}
   */
  async function indexBatch(nodes) {
    await Promise.all(nodes.map(indexNode));
  }

  /**
   * Index all chronicle nodes from the persistent store.
   *
   * @returns {Promise<number>} Number of nodes indexed
   */
  async function indexAll() {
    const records = db.list();
    const chronosNodes = records
      .filter((r) => r.data?._type === 'chronicle_node')
      .map((r) => r.data);

    await indexBatch(chronosNodes);
    return chronosNodes.length;
  }

  /**
   * Search for chronicle nodes by natural language query.
   *
   * @param {string} query - Natural language search query
   * @param {object} [options]
   * @param {number} [options.topK=5] - Number of results
   * @param {number} [options.minScore=0.3] - Minimum similarity threshold
   * @param {number} [options.startMs] - Filter by time range start
   * @param {number} [options.endMs] - Filter by time range end
   * @param {string} [options.path] - Filter by path prefix
   * @returns {Array<{node, score, text}>}
   */
  async function search(query, { topK = 5, minScore = 0.3, startMs, endMs, path } = {}) {
    const queryVec = await embed(query);
    const results = [];

    for (const [id, entry] of vectors) {
      // Apply filters
      if (startMs && entry.node.timestamp < startMs) continue;
      if (endMs && entry.node.timestamp > endMs) continue;
      if (path && !entry.node.path.startsWith(path)) continue;

      const score = cosineSimilarity(queryVec, entry.vector);
      if (score >= minScore) {
        results.push({ node: entry.node, score, text: entry.text });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Search and trace — find relevant nodes then walk their causal chains.
   *
   * @param {string} query
   * @param {object} [options] - Same as search options + traceDepth
   * @returns {Array<{match, chain}>}
   */
  async function searchAndTrace(query, { topK = 3, traceDepth = 5, ...searchOpts } = {}) {
    const matches = await search(query, { topK, ...searchOpts });

    // Build edge index from stored data
    const records = db.list();
    const nodeMap = new Map();
    const backwardEdges = new Map(); // to → [from]

    for (const r of records) {
      if (r.data?._type === 'chronicle_node') {
        nodeMap.set(r.data.id, r.data);
      } else if (r.data?._type === 'chronicle_edge' && r.data.type === 'causes') {
        if (!backwardEdges.has(r.data.to)) backwardEdges.set(r.data.to, []);
        backwardEdges.get(r.data.to).push(r.data.from);
      }
    }

    return matches.map(({ node, score, text }) => {
      // Walk backward from this node
      const chain = [];
      const visited = new Set();
      const queue = [{ id: node.id, depth: 0 }];

      while (queue.length > 0) {
        const { id, depth } = queue.shift();
        if (visited.has(id) || depth > traceDepth) continue;
        visited.add(id);

        const n = nodeMap.get(id);
        if (n) chain.push(n);

        const parents = backwardEdges.get(id) || [];
        for (const pid of parents) {
          queue.push({ id: pid, depth: depth + 1 });
        }
      }

      return { match: { node, score, text }, chain };
    });
  }

  /**
   * Stats about the semantic index.
   *
   * @returns {{ indexed: number, dimensions: number }}
   */
  function stats() {
    return {
      indexed: vectors.size,
      dimensions,
    };
  }

  return {
    indexNode,
    indexBatch,
    indexAll,
    search,
    searchAndTrace,
    stats,
    diffToText, // Exposed for testing
  };
}
