/**
 * Chronos Time-Travel Debugger
 *
 * Step forward and backward through recorded state history.
 * Works identically with in-memory chronicle data and records loaded
 * from the persistent writer — it operates on raw ChronicleNode arrays,
 * consistent with `@plures/chronos/query` and `@plures/chronos/trace`.
 *
 * @module @plures/chronos/time-travel
 *
 * @example
 * ```js
 * import { createTimeTravelDebugger } from '@plures/chronos/time-travel';
 *
 * const dbg = createTimeTravelDebugger(chronicle._nodes);
 *
 * dbg.stepForward();          // advance to first recorded change
 * console.log(dbg.current()); // ChronicleNode at cursor
 * console.log(dbg.snapshot()); // { 'todos.1': { text: 'buy milk' }, ... }
 *
 * dbg.stepBackward();         // rewind one step
 * dbg.seek(0);                // jump to a specific position
 * ```
 */

// ── createTimeTravelDebugger ─────────────────────────────────────────────────

/**
 * Create a time-travel debugger over a set of ChronicleNodes.
 *
 * The debugger maintains a cursor that starts *before* the first recorded
 * change (position -1). Each call to `stepForward()` or `stepBackward()`
 * advances or retreats the cursor by one step through the timeline.
 *
 * At any cursor position the `snapshot()` method reconstructs the full
 * cross-path state by scanning backward from the cursor and taking the
 * latest value seen for every path.
 *
 * @param {object[]} nodes   - Array of ChronicleNode objects to replay
 * @param {object}   [options]
 * @param {string}   [options.path]      - Limit the timeline to a single path.
 *                                         If omitted all paths are included.
 * @param {number}   [options.startMs]   - Lower timestamp bound (inclusive).
 * @param {number}   [options.endMs]     - Upper timestamp bound (inclusive).
 * @returns {TimeTravelDebugger}
 *
 * @example
 * ```js
 * import { createTimeTravelDebugger } from '@plures/chronos/time-travel';
 *
 * const dbg = createTimeTravelDebugger(chronicle._nodes, {
 *   path: 'todos.1',          // optional: limit to one path
 * });
 *
 * console.log(dbg.length);    // total steps in timeline
 *
 * dbg.stepForward();          // advance to first recorded change
 * console.log(dbg.current()); // ChronicleNode at cursor
 * console.log(dbg.snapshot()); // { 'todos.1': { text: 'buy milk' }, ... }
 *
 * dbg.seek(0);                // jump to a specific index
 * dbg.stepBackward();         // rewind one step
 *
 * for (const node of dbg.replay()) {
 *   console.log(node.path, node.diff.after);
 * }
 * ```
 */
export function createTimeTravelDebugger(nodes, {
  path,
  startMs,
  endMs,
} = {}) {
  // ── Build the ordered timeline ─────────────────────────────────────────────

  /** @type {object[]} */
  let timeline = [...nodes];

  if (path !== undefined) timeline = timeline.filter((n) => n.path === path);
  if (startMs !== undefined) timeline = timeline.filter((n) => n.timestamp >= startMs);
  if (endMs !== undefined) timeline = timeline.filter((n) => n.timestamp <= endMs);

  // Stable sort: primary key timestamp ascending, secondary key insertion order
  timeline.sort((a, b) => a.timestamp - b.timestamp || 0);

  // ── Cursor state ───────────────────────────────────────────────────────────

  let _cursor = -1; // -1 = before the timeline (no state applied yet)

  // ── Navigation ─────────────────────────────────────────────────────────────

  /**
   * Advance the cursor by one step toward the end of the timeline.
   *
   * @returns {boolean} `true` if the cursor moved, `false` when already at the end.
   */
  function stepForward() {
    if (_cursor >= timeline.length - 1) return false;
    _cursor++;
    return true;
  }

  /**
   * Retreat the cursor by one step toward the beginning of the timeline.
   *
   * @returns {boolean} `true` if the cursor moved, `false` when already before the start.
   */
  function stepBackward() {
    if (_cursor < 0) return false;
    _cursor--;
    return true;
  }

  /**
   * Jump the cursor to an arbitrary position in the timeline.
   *
   * @param {number} index - Target index. Valid range: `[-1, length - 1]`.
   *                         Use `-1` to reset to "before the timeline" position.
   * @throws {RangeError} When `index` is outside the valid range.
   */
  function seek(index) {
    if (index < -1 || index >= timeline.length) {
      throw new RangeError(
        `seek: index ${index} is out of range [-1, ${timeline.length - 1}]`
      );
    }
    _cursor = index;
  }

  // ── Inspection ─────────────────────────────────────────────────────────────

  /**
   * Return the ChronicleNode at the current cursor position,
   * or `null` when the cursor is before the start (`cursor === -1`).
   *
   * @returns {object|null}
   */
  function current() {
    if (_cursor < 0) return null;
    return timeline[_cursor];
  }

  /**
   * Reconstruct the full state snapshot at the current cursor position.
   *
   * The snapshot is computed by scanning backward from the cursor and
   * recording the most-recent `diff.after` value seen for each path.
   *
   * @returns {Object.<string, *>} Map of `path → currentValue`.
   *   An empty object is returned when the cursor is before the timeline.
   */
  function snapshot() {
    if (_cursor < 0) return {};

    const state = {};
    const seen = new Set();

    for (let i = _cursor; i >= 0; i--) {
      const node = timeline[i];
      if (!seen.has(node.path)) {
        seen.add(node.path);
        state[node.path] = node.diff.after;
      }
    }

    return state;
  }

  /**
   * Return an iterator that lazily yields every node from the current
   * cursor position to the end of the timeline (advancing the cursor on
   * each iteration).
   *
   * @yields {object} ChronicleNode
   * @example
   * for (const node of dbg.replay()) {
   *   console.log(node.path, node.diff.after);
   * }
   */
  function* replay() {
    while (stepForward()) {
      yield timeline[_cursor];
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    /** Current zero-based cursor index, or `-1` when before the timeline. */
    get cursor() { return _cursor; },
    /** Total number of nodes in the filtered timeline. */
    get length() { return timeline.length; },
    /** Whether `stepForward()` would move the cursor. */
    get canStepForward() { return _cursor < timeline.length - 1; },
    /** Whether `stepBackward()` would move the cursor. */
    get canStepBackward() { return _cursor >= 0; },

    stepForward,
    stepBackward,
    seek,
    current,
    snapshot,
    replay,

    // Exposed for testing / debugging
    _timeline: timeline,
  };
}
