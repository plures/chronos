/**
 * Chronos Semantic Search — vector-based search over chronicle state changes.
 *
 * @module @plures/chronos/semantic
 */

import type { ChronicleNode } from "./chronicle.js";

/** Options for `createSemanticIndex`. */
export interface SemanticIndexOptions {
  /**
   * Async function that converts a text string to an embedding vector.
   * @param text - Text to embed
   * @returns A numeric embedding vector
   */
  embed: (text: string) => Promise<number[]>;
  /** Key prefix for chronicle nodes (default: `'chronos:'`) */
  prefix?: string;
  /** Vector dimensions — must match the output of `embed` (default: 384) */
  dimensions?: number;
}

/** Options for `SemanticIndex.search`. */
export interface SemanticSearchOptions {
  /** Number of results to return (default: 5) */
  topK?: number;
  /** Minimum cosine similarity threshold (default: 0.3) */
  minScore?: number;
  /** Lower timestamp bound (inclusive) */
  startMs?: number;
  /** Upper timestamp bound (inclusive) */
  endMs?: number;
  /** Path prefix filter */
  path?: string;
}

/** A single semantic search result. */
export interface SemanticSearchResult {
  /** The matching ChronicleNode */
  node: ChronicleNode;
  /** Cosine similarity score */
  score: number;
  /** The text representation used for embedding */
  text: string;
}

/** A result from `searchAndTrace`. */
export interface SearchAndTraceResult {
  /** The semantic search match */
  match: SemanticSearchResult;
  /** The causal chain walking backward from the matching node */
  chain: ChronicleNode[];
}

/** Stats about the semantic index. */
export interface SemanticIndexStats {
  /** Number of indexed nodes */
  indexed: number;
  /** Vector dimensions */
  dimensions: number;
}

/** A semantic search index over chronicle nodes. */
export interface SemanticIndex {
  /**
   * Index a single chronicle node.
   * @param node - ChronicleNode to index
   */
  indexNode(node: ChronicleNode): Promise<void>;

  /**
   * Index multiple nodes in batch.
   * @param nodes - ChronicleNodes to index
   */
  indexBatch(nodes: ChronicleNode[]): Promise<void>;

  /**
   * Index all chronicle nodes from the persistent store.
   * @returns Number of nodes indexed
   */
  indexAll(): Promise<number>;

  /**
   * Search for chronicle nodes by natural language query.
   *
   * @param query   - Natural language search query
   * @param options - Search options
   */
  search(
    query: string,
    options?: SemanticSearchOptions,
  ): Promise<SemanticSearchResult[]>;

  /**
   * Search and trace — find relevant nodes then walk their causal chains.
   *
   * @param query   - Natural language search query
   * @param options - Search options plus `traceDepth`
   */
  searchAndTrace(
    query: string,
    options?: SemanticSearchOptions & { traceDepth?: number },
  ): Promise<SearchAndTraceResult[]>;

  /** Stats about the semantic index. */
  stats(): SemanticIndexStats;

  /**
   * Convert a chronicle node's diff into searchable text.
   * Exposed for testing.
   * @param node - ChronicleNode to convert
   */
  diffToText(node: ChronicleNode): string;
}

/**
 * Create a semantic search index over chronicle nodes.
 *
 * @param db      - PluresDB CrdtStore instance (for persistent nodes)
 * @param options - Semantic index options (must include `embed` function)
 * @returns A new SemanticIndex
 */
export declare function createSemanticIndex(
  db: object,
  options: SemanticIndexOptions,
): SemanticIndex;
