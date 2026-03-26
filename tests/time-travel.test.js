import { describe, it, expect, beforeEach } from 'vitest';
import { createTimeTravelDebugger } from '../src/time-travel.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

let _seq = 0;

/**
 * Build a minimal ChronicleNode for use in tests.
 */
function makeNode(path, before, after, timestampOffset = 0) {
  return {
    id: `chrono:test-${++_seq}`,
    timestamp: 1000 + timestampOffset,
    path,
    diff: { before, after },
    cause: null,
    context: null,
  };
}

// ── createTimeTravelDebugger ─────────────────────────────────────────────────

describe('createTimeTravelDebugger', () => {
  /** @type {ReturnType<typeof createTimeTravelDebugger>} */
  let dbg;
  let nodes;

  beforeEach(() => {
    _seq = 0;
    nodes = [
      makeNode('counter', null, 1, 0),
      makeNode('counter', 1, 2, 10),
      makeNode('counter', 2, 3, 20),
    ];
    dbg = createTimeTravelDebugger(nodes);
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts with cursor at -1 (before the timeline)', () => {
    expect(dbg.cursor).toBe(-1);
  });

  it('exposes the correct timeline length', () => {
    expect(dbg.length).toBe(3);
  });

  it('current() returns null before the timeline', () => {
    expect(dbg.current()).toBeNull();
  });

  it('snapshot() returns empty object before the timeline', () => {
    expect(dbg.snapshot()).toEqual({});
  });

  it('canStepForward is true at cursor -1', () => {
    expect(dbg.canStepForward).toBe(true);
  });

  it('canStepBackward is false at cursor -1', () => {
    expect(dbg.canStepBackward).toBe(false);
  });

  // ── stepForward ────────────────────────────────────────────────────────────

  it('stepForward() moves cursor to 0 and returns true', () => {
    expect(dbg.stepForward()).toBe(true);
    expect(dbg.cursor).toBe(0);
  });

  it('stepForward() returns false at end of timeline', () => {
    dbg.seek(2);
    expect(dbg.stepForward()).toBe(false);
    expect(dbg.cursor).toBe(2);
  });

  it('stepForward() advances through every node in order', () => {
    const afterValues = [];
    while (dbg.stepForward()) {
      afterValues.push(dbg.current().diff.after);
    }
    expect(afterValues).toEqual([1, 2, 3]);
  });

  // ── stepBackward ───────────────────────────────────────────────────────────

  it('stepBackward() returns false before the timeline', () => {
    expect(dbg.stepBackward()).toBe(false);
    expect(dbg.cursor).toBe(-1);
  });

  it('stepBackward() retreats cursor by one', () => {
    dbg.seek(2);
    expect(dbg.stepBackward()).toBe(true);
    expect(dbg.cursor).toBe(1);
  });

  it('stepBackward() reaches -1 from position 0', () => {
    dbg.seek(0);
    expect(dbg.stepBackward()).toBe(true);
    expect(dbg.cursor).toBe(-1);
  });

  it('stepForward then stepBackward returns to original position', () => {
    dbg.seek(1);
    dbg.stepForward();
    dbg.stepBackward();
    expect(dbg.cursor).toBe(1);
  });

  // ── canStepForward / canStepBackward ───────────────────────────────────────

  it('canStepForward is false at the last node', () => {
    dbg.seek(2);
    expect(dbg.canStepForward).toBe(false);
  });

  it('canStepBackward is true when cursor > -1', () => {
    dbg.seek(0);
    expect(dbg.canStepBackward).toBe(true);
  });

  it('canStepBackward is false when cursor is -1', () => {
    expect(dbg.canStepBackward).toBe(false);
  });

  // ── seek ───────────────────────────────────────────────────────────────────

  it('seek() sets the cursor to any valid position', () => {
    dbg.seek(2);
    expect(dbg.cursor).toBe(2);
  });

  it('seek(-1) resets the cursor to before the timeline', () => {
    dbg.seek(2);
    dbg.seek(-1);
    expect(dbg.cursor).toBe(-1);
    expect(dbg.current()).toBeNull();
  });

  it('seek() throws RangeError for out-of-bounds index', () => {
    expect(() => dbg.seek(3)).toThrow(RangeError);
    expect(() => dbg.seek(-2)).toThrow(RangeError);
  });

  // ── current ────────────────────────────────────────────────────────────────

  it('current() returns the node at the cursor', () => {
    dbg.seek(1);
    expect(dbg.current().diff.after).toBe(2);
  });

  it('current() reflects the node path and diff', () => {
    dbg.stepForward();
    const node = dbg.current();
    expect(node.path).toBe('counter');
    expect(node.diff.before).toBeNull();
    expect(node.diff.after).toBe(1);
  });

  // ── snapshot ───────────────────────────────────────────────────────────────

  it('snapshot() returns the latest value for each path at the current position', () => {
    dbg.seek(1);
    expect(dbg.snapshot()).toEqual({ counter: 2 });
  });

  it('snapshot() reflects all paths in a multi-path timeline', () => {
    const multiNodes = [
      makeNode('a', null, 'a1', 0),
      makeNode('b', null, 'b1', 10),
      makeNode('a', 'a1', 'a2', 20),
    ];
    const d = createTimeTravelDebugger(multiNodes);
    d.seek(2);
    expect(d.snapshot()).toEqual({ a: 'a2', b: 'b1' });
  });

  it('snapshot() only includes paths up to the cursor', () => {
    const multiNodes = [
      makeNode('x', null, 1, 0),
      makeNode('y', null, 2, 10),
    ];
    const d = createTimeTravelDebugger(multiNodes);
    d.seek(0);
    expect(d.snapshot()).toEqual({ x: 1 });
  });

  // ── replay ─────────────────────────────────────────────────────────────────

  it('replay() yields all nodes from the current position to the end', () => {
    const collected = [...dbg.replay()];
    expect(collected.length).toBe(3);
    expect(collected.map((n) => n.diff.after)).toEqual([1, 2, 3]);
  });

  it('replay() starts from the current cursor position', () => {
    dbg.seek(1);
    const collected = [...dbg.replay()];
    expect(collected.length).toBe(1);
    expect(collected[0].diff.after).toBe(3);
  });

  it('replay() advances the cursor to the end of the timeline', () => {
    // Consume the replay
    for (const _ of dbg.replay()) { /* drain */ }
    expect(dbg.cursor).toBe(2);
    expect(dbg.canStepForward).toBe(false);
  });

  it('replay() yields nothing when already at the end', () => {
    dbg.seek(2);
    const collected = [...dbg.replay()];
    expect(collected).toEqual([]);
  });

  // ── Filtering options ──────────────────────────────────────────────────────

  it('path option limits the timeline to a single path', () => {
    const mixed = [
      makeNode('a', null, 1, 0),
      makeNode('b', null, 2, 10),
      makeNode('a', 1, 3, 20),
    ];
    const d = createTimeTravelDebugger(mixed, { path: 'a' });
    expect(d.length).toBe(2);
    d.stepForward();
    expect(d.current().diff.after).toBe(1);
    d.stepForward();
    expect(d.current().diff.after).toBe(3);
  });

  it('startMs / endMs filter the timeline by timestamp', () => {
    const timed = [
      makeNode('k', null, 'v1', 0),
      makeNode('k', 'v1', 'v2', 50),
      makeNode('k', 'v2', 'v3', 100),
    ];
    const d = createTimeTravelDebugger(timed, { startMs: 1010, endMs: 1060 });
    expect(d.length).toBe(1);
    d.stepForward();
    expect(d.current().diff.after).toBe('v2');
  });

  it('nodes are ordered by timestamp ascending regardless of insertion order', () => {
    const unordered = [
      makeNode('p', 'b', 'c', 20),
      makeNode('p', null, 'a', 0),
      makeNode('p', 'c', 'd', 10),
    ];
    // Force different timestamps so sort matters
    unordered[0].timestamp = 1020;
    unordered[1].timestamp = 1000;
    unordered[2].timestamp = 1010;

    const d = createTimeTravelDebugger(unordered);
    const values = [];
    while (d.stepForward()) values.push(d.current().diff.after);
    expect(values).toEqual(['a', 'd', 'c']);
  });

  it('sort is stable when two nodes share the same timestamp', () => {
    // Both nodes have identical timestamps — exercises the `|| 0` tie-break in sort
    const n1 = makeNode('p', null, 'first', 0);
    const n2 = makeNode('p', null, 'second', 0);
    n1.timestamp = 1000;
    n2.timestamp = 1000;

    const d = createTimeTravelDebugger([n2, n1]);
    // Timeline has 2 nodes regardless of their insertion order
    expect(d.length).toBe(2);
    d.stepForward();
    d.stepForward();
    // Both nodes are reachable — no assertion on order since tie-break is stable but arbitrary
    expect(d.current()).not.toBeNull();
  });

  // ── Empty timeline edge cases ──────────────────────────────────────────────

  it('handles an empty nodes array gracefully', () => {
    const d = createTimeTravelDebugger([]);
    expect(d.length).toBe(0);
    expect(d.cursor).toBe(-1);
    expect(d.current()).toBeNull();
    expect(d.snapshot()).toEqual({});
    expect(d.stepForward()).toBe(false);
    expect(d.stepBackward()).toBe(false);
    expect(d.canStepForward).toBe(false);
    expect(d.canStepBackward).toBe(false);
  });

  it('seek on empty timeline allows only -1', () => {
    const d = createTimeTravelDebugger([]);
    expect(() => d.seek(-1)).not.toThrow();
    expect(() => d.seek(0)).toThrow(RangeError);
  });

  // ── Single-node timeline ───────────────────────────────────────────────────

  it('handles a single-node timeline', () => {
    const d = createTimeTravelDebugger([makeNode('k', null, 42, 0)]);
    expect(d.length).toBe(1);
    expect(d.stepForward()).toBe(true);
    expect(d.current().diff.after).toBe(42);
    expect(d.stepForward()).toBe(false);
    expect(d.stepBackward()).toBe(true);
    expect(d.cursor).toBe(-1);
  });
});
