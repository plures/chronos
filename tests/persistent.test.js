import { describe, it, expect, beforeEach } from 'vitest';
import { createPersistentWriter } from '../src/persistent.js';
import { createChronos, withCause } from '../src/index.js';

// ── Mock PluresDB CrdtStore ─────────────────────────────────────────────────

function createMockCrdtStore() {
  const records = new Map();
  return {
    put(key, actor, data) {
      records.set(key, { key, actor, data });
    },
    list() {
      return Array.from(records.values());
    },
    get(key) {
      return records.get(key) ?? null;
    },
    // For chronos subscription
    _listeners: [],
    on(fn) {
      this._listeners.push(fn);
      return () => {
        const idx = this._listeners.indexOf(fn);
        if (idx >= 0) this._listeners.splice(idx, 1);
      };
    },
    emit(data, key) {
      for (const fn of this._listeners) fn(data, key);
    },
  };
}

// ── Persistent Writer Tests ─────────────────────────────────────────────────

describe('createPersistentWriter', () => {
  let db, writer;

  beforeEach(() => {
    db = createMockCrdtStore();
    writer = createPersistentWriter(db);
  });

  it('writes nodes to PluresDB', () => {
    writer.writeBatch(
      [{ id: 'n1', timestamp: 1000, path: 'a', diff: { before: null, after: 1 } }],
      []
    );
    const stats = writer.stats();
    expect(stats.nodes).toBe(1);
  });

  it('writes edges to PluresDB', () => {
    writer.writeBatch(
      [],
      [{ from: 'n1', to: 'n2', type: 'causes', timestamp: 1000 }]
    );
    const stats = writer.stats();
    expect(stats.edges).toBe(1);
  });

  it('queryRange returns nodes in time window', () => {
    writer.writeBatch(
      [
        { id: 'a', timestamp: 100, path: 'x', diff: {} },
        { id: 'b', timestamp: 200, path: 'x', diff: {} },
        { id: 'c', timestamp: 300, path: 'x', diff: {} },
      ],
      []
    );
    const result = writer.queryRange(150, 250);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('b');
  });

  it('queryRange returns multiple nodes sorted by timestamp', () => {
    // Insert in reverse order to exercise the sort in queryRange
    writer.writeBatch(
      [
        { id: 'c', timestamp: 300, path: 'x', diff: {} },
        { id: 'a', timestamp: 100, path: 'x', diff: {} },
        { id: 'b', timestamp: 200, path: 'x', diff: {} },
      ],
      []
    );
    const result = writer.queryRange(50, 350);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
    expect(result[2].id).toBe('c');
  });

  it('queryEdges returns edges for a node', () => {
    writer.writeBatch([], [
      { from: 'a', to: 'b', type: 'causes', timestamp: 100 },
      { from: 'b', to: 'c', type: 'causes', timestamp: 200 },
      { from: 'a', to: 'd', type: 'context', timestamp: 100 },
    ]);
    const causal = writer.queryEdges('a', 'causes');
    expect(causal.length).toBe(1);
    const all = writer.queryEdges('a');
    expect(all.length).toBe(2);
  });

  it('trace walks causal chain backward', () => {
    writer.writeBatch(
      [
        { id: 'root', timestamp: 100, path: 's1', diff: {} },
        { id: 'mid', timestamp: 200, path: 's2', diff: {} },
        { id: 'leaf', timestamp: 300, path: 's3', diff: {} },
      ],
      [
        { from: 'root', to: 'mid', type: 'causes', timestamp: 200 },
        { from: 'mid', to: 'leaf', type: 'causes', timestamp: 300 },
      ]
    );

    const chain = writer.trace('leaf', { direction: 'backward' });
    expect(chain.map((n) => n.id)).toEqual(['leaf', 'mid', 'root']);
  });

  it('trace walks forward', () => {
    writer.writeBatch(
      [
        { id: 'root', timestamp: 100, path: 's1', diff: {} },
        { id: 'e1', timestamp: 200, path: 's2', diff: {} },
        { id: 'e2', timestamp: 200, path: 's3', diff: {} },
      ],
      [
        { from: 'root', to: 'e1', type: 'causes', timestamp: 200 },
        { from: 'root', to: 'e2', type: 'causes', timestamp: 200 },
      ]
    );

    const effects = writer.trace('root', { direction: 'forward' });
    expect(effects.length).toBe(3);
  });

  it('history returns path changes in order', () => {
    writer.writeBatch(
      [
        { id: 'a', timestamp: 300, path: 'counter', diff: { after: 3 } },
        { id: 'b', timestamp: 100, path: 'counter', diff: { after: 1 } },
        { id: 'c', timestamp: 200, path: 'counter', diff: { after: 2 } },
        { id: 'd', timestamp: 150, path: 'other', diff: { after: 'x' } },
      ],
      []
    );

    const hist = writer.history('counter');
    expect(hist.length).toBe(3);
    expect(hist[0].diff.after).toBe(1);
    expect(hist[2].diff.after).toBe(3);
  });
});

// ── Integration: Chronos + Persistent Writer ────────────────────────────────

describe('chronos with persistent writer', () => {
  let db, writer, chronos;

  beforeEach(() => {
    db = createMockCrdtStore();
    writer = createPersistentWriter(db);
    chronos = createChronos(db, { batchMs: 0, writer });
  });

  it('state changes are persisted to PluresDB', async () => {
    db.emit({ val: 1 }, 'key1');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    const stats = writer.stats();
    expect(stats.nodes).toBe(1);
  });

  it('causal chains are persisted', async () => {
    db.emit('root', 'a');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();
    const rootId = chronos._nodes[0].id;

    withCause(rootId, () => {
      db.emit('child', 'b');
    });
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    const stats = writer.stats();
    expect(stats.nodes).toBe(2);
    expect(stats.edges).toBe(1);

    // Verify trace works through persistent storage
    const chain = writer.trace(chronos._nodes[1].id, { direction: 'backward' });
    expect(chain.length).toBe(2);
  });
});
