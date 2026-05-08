/**
 * Log Gate — the procedure that decides what gets logged.
 *
 * @module @plures/chronos/log-gate
 */

import type { ChronicleNode } from "./chronicle.js";
import type { ContractRegistry } from "./contract.js";

/** Sink writer interface — receives batches of ChronicleNodes. */
export interface SinkWriter {
  /** Write nodes to the sink. */
  write(nodes: ChronicleNode[]): void;
  /** Close the sink (optional). */
  close?(): void;
}

/** Configuration for the log gate. */
export interface LogGateConfig {
  /** Active log level threshold (default: INFO = 2) */
  activeLevel?: number;
  /** Rolling buffer window in ms (default: 5000) */
  bufferWindowMs?: number;
  /** Rolling buffer max entries (default: 1000) */
  bufferMaxEntries?: number;
  /** Sink writer */
  sink?: SinkWriter | null;
}

/** Log gate statistics. */
export interface LogGateStats {
  totalWrites: number;
  totalLogged: number;
  totalDropped: number;
  totalErrorFlushes: number;
  activeLevel: number;
  bufferStats: {
    count: number;
    maxEntries: number;
    windowMs: number;
    frozen: boolean;
  };
}

/** A log gate instance. */
export interface LogGate {
  /** Process a PluresDB write through the contract + level gate. */
  onWrite(key: string, before: unknown, after: unknown, context?: string): void;
  /** Error escalation — flush the rolling buffer to the sink. */
  onError(errorId: string, errorData?: Record<string, unknown>): void;
  /** Change the active log level at runtime. */
  setLevel(level: number): void;
  /** Get the current active log level. */
  getLevel(): number;
  /** Gate statistics. */
  stats(): LogGateStats;
}

/** Create a log gate that processes PluresDB writes through contracts. */
export declare function createLogGate(
  registry: ContractRegistry,
  config?: LogGateConfig,
): LogGate;
