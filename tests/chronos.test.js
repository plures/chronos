import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChronos, createNode, withCause, currentCause } from '../src/index.js';

// ── Mock PluresDB ───────────────────────────────────────────────────────────

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
    // Simulate a state change
    emit(data, key) {
      for (const fn of listeners) fn(data, key);
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('createNode', () => {
  it('creates a node with path and diff', () => {
    const node = createNode('todos.abc', null, { text: 'hello' });
    expect(node.id).toMatch(/^chrono:/);
    expect(node.path).toBe('todos.abc');
    expect(node.diff.before).toBeNull();
    expect(node.diff.after).toEqual({ text: 'hello' });
    expect(node.cause).toBeNull();
    expect(node.timestamp).toBeGreaterThan(0);
  });

  it('captures context when provided', () => {
    const node = createNode('x', null, 1, 'session:42');
    expect(node.context).toBe('session:42');
  });
});

describe('causal context', () => {
  it('currentCause returns null outside withCause', () => {
    expect(currentCause()).toBeNull();
  });

  it('withCause sets causal parent for nodes created inside', () => {
    let captured;
    withCause('parent:1', () => {
      captured = createNode('x', null, 1);
    });
    expect(captured.cause).toBe('parent:1');
  });

  it('nested withCause overrides parent', () => {
    let inner;
    withCause('a', () => {
      withCause('b', () => {
        inner = createNode('x', null, 1);
      });
    });
    expect(inner.cause).toBe('b');
  });
});

describe('createChronos', () => {
  let db, chronos;

  beforeEach(() => {
    db = createMockDb();
    chronos = createChronos(db, { batchMs: 0 }); // instant flush for tests
  });

  it('captures state changes from db.on()', async () => {
    db.emit({ text: 'buy milk' }, 'todos.1');
    // Give the setTimeout(0) a tick
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    expect(chronos.stats().nodes).toBe(1);
    const node = chronos._nodes[0];
    expect(node.path).toBe('todos.1');
    expect(node.diff.before).toBeNull();
    expect(node.diff.after).toEqual({ text: 'buy milk' });
  });

  it('skips duplicate values', async () => {
    db.emit('hello', 'greeting');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    db.emit('hello', 'greeting'); // same value
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    expect(chronos.stats().nodes).toBe(1);
  });

  it('tracks diffs with before/after', async () => {
    db.emit('v1', 'key');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    db.emit('v2', 'key');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    expect(chronos.stats().nodes).toBe(2);
    expect(chronos._nodes[1].diff.before).toBe('v1');
    expect(chronos._nodes[1].diff.after).toBe('v2');
  });

  it('creates causal edges when withCause is used', async () => {
    db.emit('root', 'a');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    const rootId = chronos._nodes[0].id;

    withCause(rootId, () => {
      db.emit('child', 'b');
    });
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    expect(chronos._edges.some((e) => e.type === 'causes' && e.from === rootId)).toBe(true);
  });

  it('history returns all changes for a path in order', async () => {
    db.emit(1, 'counter');
    db.emit(2, 'counter');
    db.emit(3, 'counter');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    const hist = chronos.history('counter');
    expect(hist.length).toBe(3);
    expect(hist[0].diff.after).toBe(1);
    expect(hist[2].diff.after).toBe(3);
  });

  it('range filters by timestamp', async () => {
    const before = Date.now();
    db.emit('x', 'a');
    await new Promise((r) => setTimeout(r, 20));
    const mid = Date.now();
    db.emit('y', 'b');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    const all = chronos.range(before, Date.now());
    expect(all.length).toBe(2);

    const later = chronos.range(mid, Date.now());
    expect(later.length).toBe(1);
    expect(later[0].diff.after).toBe('y');
  });

  it('trace walks backward through causal chain', async () => {
    db.emit('root', 'step1');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();
    const rootId = chronos._nodes[0].id;

    withCause(rootId, () => {
      db.emit('mid', 'step2');
    });
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();
    const midId = chronos._nodes[1].id;

    withCause(midId, () => {
      db.emit('leaf', 'step3');
    });
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();
    const leafId = chronos._nodes[2].id;

    const chain = chronos.trace(leafId, { direction: 'backward' });
    expect(chain.length).toBe(3);
    expect(chain.map((n) => n.path)).toEqual(['step3', 'step2', 'step1']);
  });

  it('trace walks forward through effects', async () => {
    db.emit('root', 'a');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();
    const rootId = chronos._nodes[0].id;

    withCause(rootId, () => {
      db.emit('effect1', 'b');
      db.emit('effect2', 'c');
    });
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();

    const effects = chronos.trace(rootId, { direction: 'forward' });
    expect(effects.length).toBe(3); // root + 2 effects
  });

  it('stop flushes remaining and unsubscribes', async () => {
    db.emit('data', 'key');
    chronos.stop();
    expect(chronos.stats().nodes).toBe(1); // flushed on stop

    db.emit('more', 'key2');
    await new Promise((r) => setTimeout(r, 10));
    chronos.flush();
    expect(chronos.stats().nodes).toBe(1); // unsubscribed, no new nodes
  });
});
