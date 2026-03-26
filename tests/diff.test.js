import { describe, it, expect } from 'vitest';
import { computeDiff } from '../src/diff.js';

// ── computeDiff ──────────────────────────────────────────────────────────────

describe('computeDiff', () => {
  describe('fast-path equality', () => {
    it('returns null for identical primitive references', () => {
      expect(computeDiff(1, 1)).toBeNull();
      expect(computeDiff('hello', 'hello')).toBeNull();
      expect(computeDiff(true, true)).toBeNull();
      expect(computeDiff(false, false)).toBeNull();
    });

    it('returns null when the same object reference is passed', () => {
      const obj = { a: 1 };
      expect(computeDiff(obj, obj)).toBeNull();
    });
  });

  describe('null / undefined normalization', () => {
    it('returns null when both sides normalize to null', () => {
      expect(computeDiff(null, null)).toBeNull();
      expect(computeDiff(undefined, undefined)).toBeNull();
      expect(computeDiff(null, undefined)).toBeNull();
      expect(computeDiff(undefined, null)).toBeNull();
    });
  });

  describe('create — null/undefined → value', () => {
    it('returns create when before is null', () => {
      expect(computeDiff(null, 42)).toEqual({ op: 'create', value: 42 });
    });

    it('returns create when before is undefined', () => {
      expect(computeDiff(undefined, 'hello')).toEqual({ op: 'create', value: 'hello' });
    });

    it('returns create for an object value', () => {
      expect(computeDiff(null, { x: 1 })).toEqual({ op: 'create', value: { x: 1 } });
    });

    it('returns create for an array value', () => {
      expect(computeDiff(null, [1, 2, 3])).toEqual({ op: 'create', value: [1, 2, 3] });
    });
  });

  describe('delete — value → null/undefined', () => {
    it('returns delete when after is null', () => {
      expect(computeDiff(42, null)).toEqual({ op: 'delete', from: 42 });
    });

    it('returns delete when after is undefined', () => {
      expect(computeDiff('hello', undefined)).toEqual({ op: 'delete', from: 'hello' });
    });

    it('returns delete for an object value', () => {
      expect(computeDiff({ x: 1 }, null)).toEqual({ op: 'delete', from: { x: 1 } });
    });

    it('returns delete for an array value', () => {
      expect(computeDiff([1, 2], null)).toEqual({ op: 'delete', from: [1, 2] });
    });
  });

  describe('replace — type change', () => {
    it('replaces number with string', () => {
      expect(computeDiff(1, '1')).toEqual({ op: 'replace', from: 1, value: '1' });
    });

    it('replaces object with array', () => {
      expect(computeDiff({}, [])).toEqual({ op: 'replace', from: {}, value: [] });
    });

    it('replaces array with object', () => {
      expect(computeDiff([], {})).toEqual({ op: 'replace', from: [], value: {} });
    });

    it('replaces boolean with number', () => {
      expect(computeDiff(true, 1)).toEqual({ op: 'replace', from: true, value: 1 });
    });
  });

  describe('replace — primitive value change', () => {
    it('replaces number', () => {
      expect(computeDiff(1, 2)).toEqual({ op: 'replace', from: 1, value: 2 });
    });

    it('replaces string', () => {
      expect(computeDiff('a', 'b')).toEqual({ op: 'replace', from: 'a', value: 'b' });
    });

    it('replaces boolean', () => {
      expect(computeDiff(false, true)).toEqual({ op: 'replace', from: false, value: true });
    });
  });

  describe('patch — object field-level diff', () => {
    it('patches a single changed field', () => {
      const d = computeDiff({ a: 1, b: 2 }, { a: 1, b: 99 });
      expect(d).toEqual({ op: 'patch', changes: { b: { op: 'replace', from: 2, value: 99 } } });
    });

    it('includes new keys as create ops', () => {
      const d = computeDiff({ a: 1 }, { a: 1, b: 2 });
      expect(d).toEqual({ op: 'patch', changes: { b: { op: 'create', value: 2 } } });
    });

    it('includes removed keys as delete ops', () => {
      const d = computeDiff({ a: 1, b: 2 }, { a: 1 });
      expect(d).toEqual({ op: 'patch', changes: { b: { op: 'delete', from: 2 } } });
    });

    it('returns null for structurally identical objects', () => {
      expect(computeDiff({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBeNull();
    });

    it('computes nested object diffs', () => {
      const d = computeDiff(
        { user: { name: 'Alice', age: 30 } },
        { user: { name: 'Bob', age: 30 } }
      );
      expect(d).toEqual({
        op: 'patch',
        changes: {
          user: {
            op: 'patch',
            changes: { name: { op: 'replace', from: 'Alice', value: 'Bob' } },
          },
        },
      });
    });

    it('patches multiple changed fields', () => {
      const d = computeDiff({ a: 1, b: 2, c: 3 }, { a: 10, b: 20, c: 3 });
      expect(d).toEqual({
        op: 'patch',
        changes: {
          a: { op: 'replace', from: 1, value: 10 },
          b: { op: 'replace', from: 2, value: 20 },
        },
      });
    });
  });

  describe('patch — array element diff', () => {
    it('returns null for identical arrays', () => {
      expect(computeDiff([1, 2, 3], [1, 2, 3])).toBeNull();
    });

    it('returns replace for arrays of different lengths', () => {
      expect(computeDiff([1, 2], [1, 2, 3])).toEqual({
        op: 'replace',
        from: [1, 2],
        value: [1, 2, 3],
      });
    });

    it('returns patch for same-length arrays with element changes', () => {
      const d = computeDiff([1, 2, 3], [1, 9, 3]);
      expect(d).toEqual({
        op: 'patch',
        changes: { 1: { op: 'replace', from: 2, value: 9 } },
      });
    });

    it('patches multiple changed elements', () => {
      const d = computeDiff([10, 20, 30], [10, 99, 88]);
      expect(d).toEqual({
        op: 'patch',
        changes: {
          1: { op: 'replace', from: 20, value: 99 },
          2: { op: 'replace', from: 30, value: 88 },
        },
      });
    });

    it('patches nested objects inside arrays', () => {
      const d = computeDiff(
        [{ id: 1, val: 'a' }],
        [{ id: 1, val: 'b' }]
      );
      expect(d).toEqual({
        op: 'patch',
        changes: {
          0: {
            op: 'patch',
            changes: { val: { op: 'replace', from: 'a', value: 'b' } },
          },
        },
      });
    });
  });
});
