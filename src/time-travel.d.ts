/**
 * Chronos Time-Travel Debugger
 *
 * @module @plures/chronos/time-travel
 */

import type { ChronicleNode } from './chronicle.js';

/** Options for `createTimeTravelDebugger`. */
export interface TimeTravelOptions {
  /**
   * Limit the timeline to a single path.
   * If omitted all paths are included.
   */
  path?: string;
  /** Lower timestamp bound (inclusive). */
  startMs?: number;
  /** Upper timestamp bound (inclusive). */
  endMs?: number;
}

/**
 * A time-travel debugger over a set of ChronicleNodes.
 *
 * The debugger maintains a cursor that starts *before* the first recorded
 * change (position -1). Each call to `stepForward()` or `stepBackward()`
 * advances or retreats the cursor by one step through the timeline.
 */
export interface TimeTravelDebugger {
  /** Current zero-based cursor index, or `-1` when before the timeline. */
  readonly cursor: number;
  /** Total number of nodes in the filtered timeline. */
  readonly length: number;
  /** Whether `stepForward()` would move the cursor. */
  readonly canStepForward: boolean;
  /** Whether `stepBackward()` would move the cursor. */
  readonly canStepBackward: boolean;

  /**
   * Advance the cursor by one step toward the end of the timeline.
   * @returns `true` if the cursor moved, `false` when already at the end.
   */
  stepForward(): boolean;

  /**
   * Retreat the cursor by one step toward the beginning of the timeline.
   * @returns `true` if the cursor moved, `false` when already before the start.
   */
  stepBackward(): boolean;

  /**
   * Jump the cursor to an arbitrary position in the timeline.
   * @param index - Target index. Valid range: `[-1, length - 1]`.
   * @throws {RangeError} When `index` is outside the valid range.
   */
  seek(index: number): void;

  /**
   * Return the ChronicleNode at the current cursor position,
   * or `null` when the cursor is before the start (`cursor === -1`).
   */
  current(): ChronicleNode | null;

  /**
   * Reconstruct the full state snapshot at the current cursor position.
   * @returns Map of `path → currentValue`.
   */
  snapshot(): Record<string, unknown>;

  /**
   * Return an iterator that lazily yields every node from the current
   * cursor position to the end of the timeline.
   */
  replay(): Generator<ChronicleNode, void, unknown>;

  /** Internal ordered timeline (exposed for testing / debugging). */
  _timeline: ChronicleNode[];
}

/**
 * Create a time-travel debugger over a set of ChronicleNodes.
 *
 * @param nodes   - Array of ChronicleNode objects to replay
 * @param options - Filter options
 * @returns A new TimeTravelDebugger
 */
export declare function createTimeTravelDebugger(
  nodes: ChronicleNode[],
  options?: TimeTravelOptions,
): TimeTravelDebugger;
