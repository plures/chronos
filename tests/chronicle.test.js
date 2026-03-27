import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeDiff } from '../src/diff.js';
import { createChronicle, createChronicleNode, withCause, currentCause } from '../src/chronicle.js';

// ── Mock PluresDB ────────────────────────────────────────────────────────────

function createMockDb() {
  const listeners = [];
  return {
    on(fn) {
      listeners.push(fn);
      return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    emit(data, key) {
      for (const fn of listeners) fn(data, key);
    },
  };
}

// ── computeDiff ──────────────────────────────────────────────────────────────

describe('computeDiff', () => {
  it('returns null for identical primitives', () => {
    expect(computeDiff(1, 1)).toBeNull();
    expect(computeDiff('a', 'a')).toBeNull();
    expect(computeDiff(true, true)).toBeNull();
    expect(computeDiff(null, null)).toBeNull();
  });

  it('returns null when both before and after normalize to null', () => {
    // null !== undefined so the fast-path is bypassed; both normalize to null
    expect(computeDiff(null, undefined)).toBeNull();
    expect(computeDiff(undefined, null)).toBeNull();
  });

  it('returns null for structurally identical objects', () => {
    expect(computeDiff({ a: 1 }, { a: 1 })).toBeNull();
    expect(computeDiff([1, 2, 3], [1, 2, 3])).toBeNull();
  });

  it('returns create op when before is null', () => {
    const d = computeDiff(null, { text: 'hello' });
    expect(d).toEqual({ op: 'create', value: { text: 'hello' } });
  });

  it('returns create op when before is undefined', () => {
    const d = computeDiff(undefined, 42);
    expect(d).toEqual({ op: 'create', value: 42 });
  });

  it('returns delete op when after is null', () => {
    const d = computeDiff({ text: 'hello' }, null);
    expect(d).toEqual({ op: 'delete', from: { text: 'hello' } });
  });

  it('returns delete op when after is undefined', () => {
    const d = computeDiff(42, undefined);
    expect(d).toEqual({ op: 'delete', from: 42 });
  });

  it('returns replace op for primitive change', () => {
    expect(computeDiff(1, 2)).toEqual({ op: 'replace', from: 1, value: 2 });
    expect(computeDiff('a', 'b')).toEqual({ op: 'replace', from: 'a', value: 'b' });
    expect(computeDiff(false, true)).toEqual({ op: 'replace', from: false, value: true });
  });

  it('returns replace op on type change', () => {
    expect(computeDiff(1, '1')).toEqual({ op: 'replace', from: 1, value: '1' });
    expect(computeDiff([], {})).toEqual({ op: 'replace', from: [], value: {} });
  });

  it('returns patch op with only changed keys for objects', () => {
    const d = computeDiff({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, c: 3 });
    expect(d).toEqual({
      op: 'patch',
      changes: { b: { op: 'replace', from: 2, value: 5 } },
    });
  });

  it('includes new keys as create in patch', () => {
    const d = computeDiff({ a: 1 }, { a: 1, b: 2 });
    expect(d).toEqual({
      op: 'patch',
      changes: { b: { op: 'create', value: 2 } },
    });
  });

  it('includes removed keys as delete in patch', () => {
    const d = computeDiff({ a: 1, b: 2 }, { a: 1 });
    expect(d).toEqual({
      op: 'patch',
      changes: { b: { op: 'delete', from: 2 } },
    });
  });

  it('computes nested object diffs', () => {
    const d = computeDiff({ user: { name: 'Alice', age: 30 } }, { user: { name: 'Bob', age: 30 } });
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

  it('returns replace for arrays of different length', () => {
    const d = computeDiff([1, 2], [1, 2, 3]);
    expect(d).toEqual({ op: 'replace', from: [1, 2], value: [1, 2, 3] });
  });

  it('returns patch for arrays of same length with element changes', () => {
    const d = computeDiff([1, 2, 3], [1, 9, 3]);
    expect(d).toEqual({
      op: 'patch',
      changes: { 1: { op: 'replace', from: 2, value: 9 } },
    });
  });

  it('returns null for unchanged arrays of same length', () => {
    expect(computeDiff([1, 2, 3], [1, 2, 3])).toBeNull();
  });
});

// ── createChronicleNode ──────────────────────────────────────────────────────

describe('createChronicleNode', () => {
  it('creates a node with path, diff, and minimal diff', () => {
    const node = createChronicleNode('todos.1', null, { text: 'buy milk' });
    expect(node.id).toMatch(/^chrono:/);
    expect(node.path).toBe('todos.1');
    expect(node.diff.before).toBeNull();
    expect(node.diff.after).toEqual({ text: 'buy milk' });
    expect(node.diff.minimal).toEqual({ op: 'create', value: { text: 'buy milk' } });
    expect(node.timestamp).toBeGreaterThan(0);
    expect(node.cause).toBeNull();
    expect(node.context).toBeNull();
  });

  it('attaches context when provided', () => {
    const node = createChronicleNode('x', null, 1, 'session:42');
    expect(node.context).toBe('session:42');
  });

  it('captures causal parent via withCause', () => {
    let captured;
    withCause('parent:1', () => {
      captured = createChronicleNode('x', null, 1);
    });
    expect(captured.cause).toBe('parent:1');
  });

  it('stores minimal patch diff for object updates', () => {
    const node = createChronicleNode('item', { a: 1, b: 2 }, { a: 1, b: 99 });
    expect(node.diff.minimal).toEqual({
      op: 'patch',
      changes: { b: { op: 'replace', from: 2, value: 99 } },
    });
  });
});

// ── createChronicle ──────────────────────────────────────────────────────────

describe('createChronicle', () => {
  let db, chronicle;

  beforeEach(() => {
    db = createMockDb();
    chronicle = createChronicle(db); // instant flush in tests (debounceMs: 0)
  });

  it('throws when db lacks .on()', () => {
    expect(() => createChronicle({})).toThrow();
  });

  it('captures state changes from db.on()', async () => {
    db.emit({ text: 'buy milk' }, 'todos.1');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    expect(chronicle.stats().nodes).toBe(1);
    const node = chronicle._nodes[0];
    expect(node.path).toBe('todos.1');
    expect(node.diff.before).toBeNull();
    expect(node.diff.after).toEqual({ text: 'buy milk' });
    expect(node.diff.minimal).toEqual({ op: 'create', value: { text: 'buy milk' } });
  });

  it('skips duplicate / no-op updates', async () => {
    db.emit('hello', 'greeting');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    db.emit('hello', 'greeting'); // same value — should be skipped
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    expect(chronicle.stats().nodes).toBe(1);
  });

  it('tracks before/after and minimal diff across updates', async () => {
    db.emit({ count: 1 }, 'counter');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    db.emit({ count: 2 }, 'counter');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    expect(chronicle.stats().nodes).toBe(2);
    const second = chronicle._nodes[1];
    expect(second.diff.before).toEqual({ count: 1 });
    expect(second.diff.after).toEqual({ count: 2 });
    expect(second.diff.minimal).toEqual({
      op: 'patch',
      changes: { count: { op: 'replace', from: 1, value: 2 } },
    });
  });

  it('creates causal edges when withCause is used', async () => {
    db.emit('root', 'a');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    const rootId = chronicle._nodes[0].id;

    withCause(rootId, () => db.emit('child', 'b'));
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    expect(chronicle._edges.some((e) => e.type === 'causes' && e.from === rootId)).toBe(true);
  });

  it('creates context edges when contextId is set', async () => {
    const ctx = createChronicle(db, { contextId: 'session:1' });
    db.emit('x', 'p');
    await new Promise((r) => setTimeout(r, 10));
    ctx.flush();

    expect(ctx._edges.some((e) => e.type === 'context' && e.from === 'session:1')).toBe(true);
    ctx.stop();
  });

  it('history returns changes for a path in timestamp order', async () => {
    db.emit(1, 'counter');
    db.emit(2, 'counter');
    db.emit(3, 'counter');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    const hist = chronicle.history('counter');
    expect(hist.length).toBe(3);
    expect(hist[0].diff.after).toBe(1);
    expect(hist[2].diff.after).toBe(3);
  });

  it('range filters nodes by timestamp', async () => {
    const t0 = Date.now();
    db.emit('x', 'a');
    await new Promise((r) => setTimeout(r, 20));
    const t1 = Date.now();
    db.emit('y', 'b');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    expect(chronicle.range(t0, Date.now()).length).toBe(2);
    expect(chronicle.range(t1, Date.now()).length).toBe(1);
    expect(chronicle.range(t1, Date.now())[0].diff.after).toBe('y');
  });

  it('subgraph returns all nodes belonging to a context', async () => {
    const ctxDb = createMockDb();
    const ctxChronicle = createChronicle(ctxDb, { batchMs: 0, contextId: 'req:77' });

    ctxDb.emit('v1', 'p1');
    ctxDb.emit('v2', 'p2');
    await new Promise((r) => setTimeout(r, 10));
    ctxChronicle.flush();

    const nodes = ctxChronicle.subgraph('req:77');
    expect(nodes.length).toBe(2);
    ctxChronicle.stop();
  });

  it('subgraph returns empty array for unknown context', async () => {
    db.emit('v', 'p');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    expect(chronicle.subgraph('nonexistent')).toEqual([]);
  });

  it('trace walks backward through causal chain', async () => {
    db.emit('root', 'step1');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();
    const rootId = chronicle._nodes[0].id;

    withCause(rootId, () => db.emit('mid', 'step2'));
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();
    const midId = chronicle._nodes[1].id;

    withCause(midId, () => db.emit('leaf', 'step3'));
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();
    const leafId = chronicle._nodes[2].id;

    const chain = chronicle.trace(leafId, { direction: 'backward' });
    expect(chain.length).toBe(3);
    expect(chain.map((n) => n.path)).toEqual(['step3', 'step2', 'step1']);
  });

  it('trace walks forward through effects', async () => {
    db.emit('root', 'a');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();
    const rootId = chronicle._nodes[0].id;

    withCause(rootId, () => {
      db.emit('effect1', 'b');
      db.emit('effect2', 'c');
    });
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    const effects = chronicle.trace(rootId, { direction: 'forward' });
    expect(effects.length).toBe(3); // root + 2 effects
  });

  it('stop flushes remaining nodes and unsubscribes', async () => {
    db.emit('data', 'key');
    chronicle.stop();
    expect(chronicle.stats().nodes).toBe(1);

    db.emit('more', 'key2');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();
    expect(chronicle.stats().nodes).toBe(1); // unsubscribed — no new nodes
  });

  // ── Debounce mode ──────────────────────────────────────────────────────────

  describe('debounced sampling', () => {
    it('coalesces rapid changes into a single node per path', async () => {
      const dbc = createChronicle(db, { debounceMs: 30 });

      db.emit(1, 'val');
      db.emit(2, 'val');
      db.emit(3, 'val');

      // Wait for debounce to settle
      await new Promise((r) => setTimeout(r, 60));
      dbc.flush();

      expect(dbc.stats().nodes).toBe(1);
      const node = dbc._nodes[0];
      expect(node.diff.before).toBeNull();
      expect(node.diff.after).toBe(3); // latest value captured
      dbc.stop();
    });

    it('emits separate nodes for changes on different paths', async () => {
      const dbc = createChronicle(db, { debounceMs: 30 });

      db.emit('a', 'pathA');
      db.emit('b', 'pathB');

      await new Promise((r) => setTimeout(r, 60));
      dbc.flush();

      expect(dbc.stats().nodes).toBe(2);
      dbc.stop();
    });

    it('stop flushes pending debounce windows immediately', () => {
      const dbc = createChronicle(db, { debounceMs: 5000 });

      db.emit('x', 'k');

      dbc.stop(); // should flush the debounce window synchronously

      expect(dbc.stats().nodes).toBe(1);
      expect(dbc._nodes[0].path).toBe('k');
      expect(dbc._nodes[0].diff.after).toBe('x');
    });
  });

  // ── Benchmark ─────────────────────────────────────────────────────────────

  it('processes state changes in < 1ms overhead each', () => {
    const ITERATIONS = 1000;
    const start = performance.now();

    for (let i = 0; i < ITERATIONS; i++) {
      db.emit({ value: i }, `bench.${i % 50}`); // 50 rotating paths
    }

    const elapsed = performance.now() - start;
    const perChange = elapsed / ITERATIONS;

    // Chronicle overhead per change must stay well under 1 ms
    expect(perChange).toBeLessThan(1);
  });

  // ── Additional coverage tests ──────────────────────────────────────────────

  it('forwards flush writes to an optional persistent writer', async () => {
    // Build a minimal mock writer to verify that chronicle calls writeBatch.
    const written = [];
    const mockWriter = { writeBatch(nodes, edges) { written.push({ nodes, edges }); } };

    const chronicleWithWriter = createChronicle(db, { batchMs: 0, writer: mockWriter });
    db.emit('value1', 'path1');
    await new Promise((r) => setTimeout(r, 10));
    chronicleWithWriter.flush();
    chronicleWithWriter.stop();

    expect(written.length).toBeGreaterThan(0);
    expect(written[0].nodes.length).toBe(1);
  });

  it('start() is idempotent — calling it twice does not double-subscribe', async () => {
    // createChronicle already calls start() internally.
    // Calling start() again must not add a second subscription.
    chronicle.start(); // second call should be a no-op

    db.emit('x', 'key');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();

    // If start() subscribed twice we would get 2 nodes instead of 1.
    expect(chronicle.stats().nodes).toBe(1);
  });

  it('trace respects maxDepth and stops traversal early', async () => {
    // Build a 3-node chain: root → mid → leaf
    db.emit('r', 'a');
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();
    const rootId = chronicle._nodes[0].id;

    withCause(rootId, () => db.emit('m', 'b'));
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();
    const midId = chronicle._nodes[1].id;

    withCause(midId, () => db.emit('l', 'c'));
    await new Promise((r) => setTimeout(r, 10));
    chronicle.flush();
    const leafId = chronicle._nodes[2].id;

    // With maxDepth=1 the traversal stops after visiting leaf and mid
    // (root would be at depth 2, which is > maxDepth=1 → continue path triggered)
    const chain = chronicle.trace(leafId, { direction: 'backward', maxDepth: 1 });
    expect(chain.length).toBe(2); // leaf + mid, root cut off by maxDepth
  });
});
