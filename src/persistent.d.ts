/**
 * Chronos PluresDB Writer — persists chronicle nodes and edges to PluresDB.
 *
 * @module @plures/chronos/persistent
 */

import type { ChronicleNode, ChronicleEdge } from './chronicle.js';

/** Options for `createPersistentWriter`. */
export interface PersistentWriterOptions {
  /** Key prefix for chronicle nodes (default: `'chronos:'`) */
  prefix?: string;
}

/** The edge type filter accepted by `queryEdges`. */
export type EdgeType = 'causes' | 'context' | 'reverts' | 'concurrent';

/** A PluresDB-backed chronicle writer. */
export interface PersistentWriter {
  /**
   * Write a batch of chronicle nodes and their edges to PluresDB.
   *
   * @param nodes - Chronicle nodes to persist
   * @param edges - Chronicle edges to persist
   */
  writeBatch(nodes: ChronicleNode[], edges: ChronicleEdge[]): void;

  /**
   * Query all chronicle nodes within a time range.
   *
   * @param startMs - Start timestamp (inclusive)
   * @param endMs   - End timestamp (inclusive)
   * @returns Matching nodes sorted by timestamp
   */
  queryRange(startMs: number, endMs: number): ChronicleNode[];

  /**
   * Query all edges for a given node.
   *
   * @param nodeId   - Node ID to query edges for
   * @param edgeType - Optional edge type filter
   * @returns Matching edges
   */
  queryEdges(nodeId: string, edgeType?: EdgeType): ChronicleEdge[];

  /**
   * Trace causal chain from a node (persistent version).
   *
   * @param nodeId  - Starting node ID
   * @param options - Traversal options
   */
  trace(
    nodeId: string,
    options?: { direction?: 'backward' | 'forward'; maxDepth?: number },
  ): ChronicleNode[];

  /**
   * Get history for a specific path (all state changes over time).
   *
   * @param path - PluresDB path to query
   */
  history(path: string): ChronicleNode[];

  /** Count total nodes and edges. */
  stats(): { nodes: number; edges: number };
}

/**
 * Create a PluresDB-backed chronicle writer.
 *
 * @param db      - PluresDB CrdtStore instance
 * @param options - Writer options
 * @returns A new PersistentWriter
 */
export declare function createPersistentWriter(
  db: object,
  options?: PersistentWriterOptions,
): PersistentWriter;
