/**
 * Chronicle — canonical implementation.
 *
 * @module @plures/chronos/chronicle
 */

import type { DiffDescriptor } from './diff.js';

export type { DiffDescriptor };

/**
 * Run a function within a causal context so that all nodes created during
 * execution carry `causeId` as their causal parent.
 *
 * Re-exported from `@plures/chronos/causal` for convenience.
 *
 * @param causeId - ID of the parent node to set as the active cause
 * @param fn - Synchronous or async function to execute inside the scope
 * @returns The return value of `fn`
 */
export { withCause } from './causal.js';

/**
 * Get the current causal parent ID.
 *
 * Re-exported from `@plures/chronos/causal` for convenience.
 *
 * @returns The active causal parent ID, or `null` when outside a causal scope.
 */
export { currentCause } from './causal.js';

/**
 * A single recorded state-change event in the chronicle graph.
 */
export interface ChronicleNode {
  /** Unique node ID (`chrono:{timestamp}-{counter}`) */
  id: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** PluresDB path that changed */
  path: string;
  /** Diff descriptor */
  diff: {
    /** Previous value (null for creates) */
    before: unknown;
    /** New value (null for deletes) */
    after: unknown;
    /** Minimal structural diff produced by the diff engine */
    minimal: DiffDescriptor | null;
  };
  /** ID of the causal parent node, or null */
  cause: string | null;
  /** Session / request context ID, or null */
  context: string | null;
}

/**
 * A directed edge in the chronicle causal graph.
 */
export interface ChronicleEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge type */
  type: 'causes' | 'context' | 'reverts' | 'concurrent';
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Create a ChronicleNode from a state diff.
 *
 * @param path       - PluresDB path that changed
 * @param before     - Previous value (null for creates)
 * @param after      - New value (null for deletes)
 * @param contextId  - Session / request context ID
 * @returns A new ChronicleNode
 */
export declare function createChronicleNode(
  path: string,
  before: unknown,
  after: unknown,
  contextId?: string,
): ChronicleNode;

/** Options for `createChronicle`. */
export interface ChronicleOptions {
  /** Default context applied to all captured nodes */
  contextId?: string | null;
  /**
   * When > 0, coalesce rapid changes per path into a single node using this
   * debounce window (ms). Default: 0 (capture every change).
   */
  debounceMs?: number;
  /** Max nodes flushed per tick (default: 100) */
  maxBatch?: number;
  /** Optional persistent writer (e.g. from `createPersistentWriter`) */
  writer?: object | null;
}

/** The object returned by `createChronicle`. */
export interface ChronicleInstance {
  /** Start recording (called automatically on construction). */
  start(): void;
  /** Stop recording and flush any pending debounce windows. */
  stop(): void;
  /** Flush pending nodes to the internal arrays immediately. */
  flush(): void;
  /**
   * Traverse the causal graph from a node.
   * @param nodeId    Starting node
   * @param options   Traversal options
   */
  trace(
    nodeId: string,
    options?: { direction?: 'backward' | 'forward'; maxDepth?: number },
  ): ChronicleNode[];
  /** Return all nodes within a timestamp range (inclusive). */
  range(startMs: number, endMs: number): ChronicleNode[];
  /** Return all nodes belonging to a context (session / request). */
  subgraph(ctxId: string): ChronicleNode[];
  /** Return all changes for a path, ordered by timestamp. */
  history(path: string): ChronicleNode[];
  /** Summary counters. */
  stats(): { nodes: number; edges: number; pending: number };
  /** Internal nodes array (exposed for testing / debugging). */
  _nodes: ChronicleNode[];
  /** Internal edges array (exposed for testing / debugging). */
  _edges: ChronicleEdge[];
}

/**
 * Create a Chronicle instance that wraps a PluresDB instance and records
 * all state changes as a causal graph with minimal JSON diffs.
 *
 * @param db      - PluresDB instance (must support `.on()` subscriptions)
 * @param options - Chronicle options
 * @returns A new ChronicleInstance
 */
export declare function createChronicle(
  db: object,
  options?: ChronicleOptions,
): ChronicleInstance;
