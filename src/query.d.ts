/**
 * Chronicle Query API
 *
 * Pure, composable query functions for filtering chronicle nodes.
 *
 * @module @plures/chronos/query
 */

import type { ChronicleNode, ChronicleEdge } from './chronicle.js';

/**
 * Return all nodes whose timestamp falls within [startMs, endMs] (inclusive),
 * sorted by timestamp ascending.
 *
 * @param nodes   - Array of ChronicleNode objects to search
 * @param startMs - Start of range (Unix ms, inclusive)
 * @param endMs   - End of range (Unix ms, inclusive)
 * @returns ChronicleNodes sorted by timestamp ascending
 */
export declare function queryByTimeRange(
  nodes: ChronicleNode[],
  startMs: number,
  endMs: number,
): ChronicleNode[];

/**
 * Return all nodes recorded at an exact path, sorted by timestamp ascending.
 *
 * @param nodes - Array of ChronicleNode objects to search
 * @param path  - Exact PluresDB path to match (e.g. `'todos.abc'`)
 * @returns ChronicleNodes sorted by timestamp ascending
 */
export declare function queryByPath(nodes: ChronicleNode[], path: string): ChronicleNode[];

/**
 * Return all nodes whose path starts with the given prefix,
 * sorted by timestamp ascending.
 *
 * @param nodes  - Array of ChronicleNode objects to search
 * @param prefix - Path prefix
 * @returns ChronicleNodes sorted by timestamp ascending
 */
export declare function queryByPathPrefix(
  nodes: ChronicleNode[],
  prefix: string,
): ChronicleNode[];

/**
 * Return all nodes that belong to a session / request context,
 * sorted by timestamp ascending.
 *
 * @param nodes     - Array of ChronicleNode objects to search
 * @param edges     - Array of ChronicleEdge objects to check context membership
 * @param contextId - Session / request context ID
 * @returns ChronicleNodes sorted by timestamp ascending
 */
export declare function queryByContext(
  nodes: ChronicleNode[],
  edges: ChronicleEdge[],
  contextId: string,
): ChronicleNode[];

/** Options for the composable `query()` function. */
export interface QueryOptions {
  /** Lower timestamp bound (inclusive) */
  startMs?: number;
  /** Upper timestamp bound (inclusive) */
  endMs?: number;
  /** Exact path match */
  path?: string;
  /** Path prefix match (applied when `path` is not supplied) */
  pathPrefix?: string;
  /** Session / request context filter */
  contextId?: string;
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip (pagination) */
  offset?: number;
}

/**
 * Run one or more filters over a set of chronicle nodes in a single pass.
 *
 * All supplied filters are applied with logical AND (intersection).
 * Omitted options are ignored (no filtering on that dimension).
 *
 * @param nodes   - Array of ChronicleNode objects to filter
 * @param edges   - Required only when `contextId` is supplied
 * @param options - Filter options
 * @returns Sorted by timestamp ascending
 */
export declare function query(
  nodes: ChronicleNode[],
  edges?: ChronicleEdge[],
  options?: QueryOptions,
): ChronicleNode[];
