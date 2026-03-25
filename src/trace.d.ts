/**
 * Chronicle Causal-Chain Traversal
 *
 * @module @plures/chronos/trace
 */

import type { ChronicleNode, ChronicleEdge } from './chronicle.js';

/** Options for `traceCausalChain`. */
export interface TraceCausalChainOptions {
  /**
   * `'backward'` follows `causes` edges toward the root cause;
   * `'forward'`  follows `causes` edges toward downstream effects.
   * @default 'backward'
   */
  direction?: 'backward' | 'forward';
  /**
   * Maximum number of hops from the starting node.
   * @default 10
   */
  maxDepth?: number;
  /**
   * Edge type to follow.
   * @default 'causes'
   */
  edgeType?: string;
}

/**
 * Walk the causal graph starting from a given node.
 *
 * @param nodes   - Array of ChronicleNode objects to search
 * @param edges   - Array of ChronicleEdge objects to traverse
 * @param nodeId  - ID of the starting node
 * @param options - Traversal options
 * @returns Ordered list of ChronicleNodes starting from nodeId
 */
export declare function traceCausalChain(
  nodes: ChronicleNode[],
  edges: ChronicleEdge[],
  nodeId: string,
  options?: TraceCausalChainOptions,
): ChronicleNode[];
