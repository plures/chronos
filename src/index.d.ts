/**
 * Chronos — main entry point (legacy).
 *
 * For new projects, prefer `@plures/chronos/chronicle`.
 *
 * @module @plures/chronos
 */

export { currentCause, withCause } from "./causal.js";

/**
 * A ChronicleNode created by the legacy `createChronos` / `createNode` API.
 * This variant stores the full before/after values without a minimal diff.
 */
export interface LegacyChronicleNode {
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
  };
  /** ID of the causal parent node, or null */
  cause: string | null;
  /** Session / request context ID, or null */
  context: string | null;
}

/** An edge in the legacy causal graph. */
export interface LegacyChronicleEdge {
  from: string;
  to: string;
  type: "causes" | "context";
  timestamp: number;
}

/**
 * Create a ChronicleNode from a state diff (legacy).
 *
 * @param path      - PluresDB path that changed
 * @param before    - Previous value (null for creates)
 * @param after     - New value (null for deletes)
 * @param contextId - Session / request context ID
 * @returns A new LegacyChronicleNode
 */
export declare function createNode(
  path: string,
  before: unknown,
  after: unknown,
  contextId?: string,
): LegacyChronicleNode;

/** Options for `createChronos`. */
export interface ChronosOptions {
  /** Default context applied to all captured nodes */
  contextId?: string | null;
  /** Batch write interval in ms (default: 50) */
  batchMs?: number;
  /** Max nodes per batch (default: 100) */
  maxBatch?: number;
  /** Persistent writer (from createPersistentWriter) */
  writer?: object | null;
}

/** The object returned by `createChronos`. */
export interface ChronosInstance {
  /** Re-start recording if stopped. */
  start(): void;
  /** Stop recording and flush pending writes. */
  stop(): void;
  /** Flush pending nodes to the internal arrays immediately. */
  flush(): void;
  /** Traverse the causal graph from a node. */
  trace(
    nodeId: string,
    options?: { direction?: "backward" | "forward"; maxDepth?: number },
  ): LegacyChronicleNode[];
  /** Return all nodes within a timestamp range (inclusive). */
  range(startMs: number, endMs: number): LegacyChronicleNode[];
  /** Return all nodes belonging to a context. */
  subgraph(ctxId: string): LegacyChronicleNode[];
  /** Return all changes for a path, ordered by timestamp. */
  history(path: string): LegacyChronicleNode[];
  /** Summary counters. */
  stats(): { nodes: number; edges: number; pending: number };
  /** Internal nodes array (exposed for testing / debugging). */
  _nodes: LegacyChronicleNode[];
  /** Internal edges array (exposed for testing / debugging). */
  _edges: LegacyChronicleEdge[];
}

/**
 * Create a Chronos instance (legacy).
 *
 * @param db      - PluresDB instance (must support `.on()` subscriptions)
 * @param options - Chronos options
 * @returns A new ChronosInstance
 */
export declare function createChronos(
  db: object,
  options?: ChronosOptions,
): ChronosInstance;
