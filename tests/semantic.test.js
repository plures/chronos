import { describe, it, expect, beforeEach } from 'vitest';
import { createSemanticIndex } from '../src/semantic.js';
import { createPersistentWriter } from '../src/persistent.js';

// ── Mock embedding function (bag-of-words style for deterministic tests) ──

function createMockEmbed(dimensions = 8) {
  // Simple hash-based mock: consistent vectors for same input
  return async (text) => {
    const vec = new Array(dimensions).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % dimensions] += text.charCodeAt(i) / 1000;
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vec.map((v) => v / norm) : vec;
  };
}

// ── Mock CrdtStore ──────────────────────────────────────────────────────────

function createMockDb() {
  const records = new Map();
  return {
    put(key, actor, data) { records.set(key, { key, actor, data }); },
    list() { return Array.from(records.values()); },
    get(key) { return records.get(key) ?? null; },
    _listeners: [],
    on(fn) {
      this._listeners.push(fn);
      return () => { this._listeners.splice(this._listeners.indexOf(fn), 1); };
    },
    emit(data, key) { for (const fn of this._listeners) fn(data, key); },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('createSemanticIndex', () => {
  let db, writer, embed, index;

  beforeEach(() => {
    db = createMockDb();
    writer = createPersistentWriter(db);
    embed = createMockEmbed(8);
    index = createSemanticIndex(db, { embed, dimensions: 8 });
  });

  it('requires embed function', () => {
    expect(() => createSemanticIndex(db, {})).toThrow('embed function');
  });

  it('diffToText creates searchable text from node', () => {
    const text = index.diffToText({
      id: 'n1', timestamp: 1000, path: 'user.name',
      diff: { before: 'Alice', after: 'Bob' },
      context: 'session-1',
    });
    expect(text).toContain('user.name');
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
    expect(text).toContain('session-1');
  });

  it('diffToText handles create (before=null)', () => {
    const text = index.diffToText({
      id: 'n1', timestamp: 1000, path: 'counter',
      diff: { before: null, after: 42 },
    });
    expect(text).toContain('created');
    expect(text).toContain('42');
  });

  it('diffToText handles delete (after=null)', () => {
    const text = index.diffToText({
      id: 'n1', timestamp: 1000, path: 'temp',
      diff: { before: 'old', after: null },
    });
    expect(text).toContain('deleted');
  });

  it('indexes and searches nodes', async () => {
    // Write some nodes to persistent store
    writer.writeBatch([
      { id: 'n1', timestamp: 1000, path: 'user.name', diff: { before: null, after: 'Alice' }, _type: 'chronicle_node' },
      { id: 'n2', timestamp: 2000, path: 'user.email', diff: { before: null, after: 'alice@example.com' }, _type: 'chronicle_node' },
      { id: 'n3', timestamp: 3000, path: 'settings.theme', diff: { before: 'light', after: 'dark' }, _type: 'chronicle_node' },
    ], []);

    const count = await index.indexAll();
    expect(count).toBe(3);
    expect(index.stats().indexed).toBe(3);

    const results = await index.search('user name', { topK: 3, minScore: 0 });
    expect(results.length).toBe(3);
    // All three indexed and returned
    const paths = results.map((r) => r.node.path);
    expect(paths).toContain('user.name');
  });

  it('filters by time range', async () => {
    writer.writeBatch([
      { id: 'a', timestamp: 100, path: 'x', diff: { before: null, after: 1 }, _type: 'chronicle_node' },
      { id: 'b', timestamp: 500, path: 'x', diff: { before: 1, after: 2 }, _type: 'chronicle_node' },
      { id: 'c', timestamp: 900, path: 'x', diff: { before: 2, after: 3 }, _type: 'chronicle_node' },
    ], []);

    await index.indexAll();

    const results = await index.search('x', { minScore: 0, startMs: 400, endMs: 600 });
    expect(results.length).toBe(1);
    expect(results[0].node.id).toBe('b');
  });

  it('filters by path prefix', async () => {
    writer.writeBatch([
      { id: 'a', timestamp: 100, path: 'user.name', diff: { before: null, after: 'A' }, _type: 'chronicle_node' },
      { id: 'b', timestamp: 200, path: 'settings.theme', diff: { before: null, after: 'dark' }, _type: 'chronicle_node' },
    ], []);

    await index.indexAll();

    const results = await index.search('something', { minScore: 0, path: 'user' });
    expect(results.length).toBe(1);
    expect(results[0].node.path).toBe('user.name');
  });

  it('searchAndTrace returns causal chains', async () => {
    writer.writeBatch([
      { id: 'root', timestamp: 100, path: 'action', diff: { before: null, after: 'click' }, _type: 'chronicle_node' },
      { id: 'effect', timestamp: 200, path: 'counter', diff: { before: 0, after: 1 }, _type: 'chronicle_node' },
    ], [
      { from: 'root', to: 'effect', type: 'causes', timestamp: 200, _type: 'chronicle_edge' },
    ]);

    // Re-create writer entries with correct _type on the stored data
    // (writeBatch adds _type, so they should already be there)

    await index.indexAll();

    const results = await index.searchAndTrace('counter increment', { topK: 1, minScore: 0 });
    expect(results.length).toBeGreaterThan(0);
    // The chain should include the root cause
    const chain = results[0].chain;
    expect(chain.length).toBeGreaterThanOrEqual(1);
  });

  it('searchAndTrace walks backward through parent nodes', async () => {
    // Write both nodes and the causal edge to the persistent store
    writer.writeBatch([
      { id: 'parent1', timestamp: 100, path: 'other.branch', diff: { before: null, after: 'trigger' } },
      { id: 'child1', timestamp: 200, path: 'target.path', diff: { before: null, after: 'result' } },
    ], [
      { from: 'parent1', to: 'child1', type: 'causes', timestamp: 200 },
    ]);

    // Only index child1 so it is always the sole (top-ranked) search result
    await index.indexNode({
      id: 'child1', timestamp: 200, path: 'target.path', diff: { before: null, after: 'result' },
    });

    const results = await index.searchAndTrace('target result', { topK: 1, minScore: 0, traceDepth: 5 });
    expect(results.length).toBe(1);
    // The chain must contain both child1 and its parent (covers the queue.push path at line 205)
    expect(results[0].chain.length).toBe(2);
    expect(results[0].chain.some((n) => n.id === 'parent1')).toBe(true);
  });

  it('indexNode adds a single node', async () => {
    await index.indexNode({
      id: 'solo', timestamp: 1000, path: 'test',
      diff: { before: null, after: 'value' },
    });
    expect(index.stats().indexed).toBe(1);
  });
});
