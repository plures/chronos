/**
 * Rolling Buffer — 5-second verbose capture with error-triggered flush.
 *
 * @module @plures/chronos/buffer
 */

import type { ChronicleNode } from "./chronicle.js";

/** A single entry in the rolling buffer. */
export interface BufferEntry {
  /** When the write occurred (ms since epoch) */
  timestamp: number;
  /** PluresDB key */
  key: string;
  /** Previous value */
  before: unknown;
  /** New value */
  after: unknown;
  /** Causal parent ID */
  cause: string | null;
  /** Session context */
  context: string | null;
}

/** Configuration for the rolling buffer. */
export interface BufferConfig {
  /** Rolling window duration in ms (default: 5000) */
  windowMs?: number;
  /** Max entries in the ring — hard cap (default: 1000) */
  maxEntries?: number;
}

/** A rolling buffer instance. */
export interface RollingBuffer {
  /** Push a write into the ring buffer. */
  push(entry: {
    key: string;
    before: unknown;
    after: unknown;
    cause?: string | null;
    context?: string | null;
  }): void;
  /** Flush the buffer on error — returns ChronicleNodes for the sink. */
  flush(errorContext?: string): ChronicleNode[];
  /** Drain all entries without clearing. */
  drain(): BufferEntry[];
  /** Clear all entries. */
  clear(): void;
  /** Buffer statistics. */
  stats(): {
    count: number;
    maxEntries: number;
    windowMs: number;
    frozen: boolean;
  };
}

/** Create a rolling buffer instance. */
export declare function createRollingBuffer(
  config?: BufferConfig,
): RollingBuffer;
