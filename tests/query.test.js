import { describe, it, expect } from 'vitest';
import { queryByTimeRange, queryByPath, queryByPathPrefix, queryByContext, query } from '../src/query.js';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function node(id, path, timestamp, context = null) {
  return { id, path, timestamp, context };
}

function ctxEdge(contextId, nodeId) {
  return { from: contextId, to: nodeId, type: 'context', timestamp: 100 };
}

// ── queryByTimeRange ─────────────────────────────────────────────────────────

describe('queryByTimeRange', () => {
  const nodes = [
    node('a', 'x', 100),
    node('b', 'x', 200),
    node('c', 'x', 300),
  ];

  it('returns nodes within the range (inclusive both ends)', () => {
    expect(queryByTimeRange(nodes, 100, 300).map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(queryByTimeRange(nodes, 150, 250).map((n) => n.id)).toEqual(['b']);
  });

  it('returns empty array when no nodes fall in range', () => {
    expect(queryByTimeRange(nodes, 400, 500)).toHaveLength(0);
  });

  it('includes nodes exactly at the boundary timestamps', () => {
    expect(queryByTimeRange(nodes, 100, 100).map((n) => n.id)).toEqual(['a']);
    expect(queryByTimeRange(nodes, 300, 300).map((n) => n.id)).toEqual(['c']);
  });

  it('returns results sorted by timestamp ascending', () => {
    const shuffled = [node('c', 'x', 300), node('a', 'x', 100), node('b', 'x', 200)];
    const result = queryByTimeRange(shuffled, 0, 400);
    expect(result.map((n) => n.timestamp)).toEqual([100, 200, 300]);
  });
});

// ── queryByPath ──────────────────────────────────────────────────────────────

describe('queryByPath', () => {
  const nodes = [
    node('a', 'todos.1', 100),
    node('b', 'todos.2', 200),
    node('c', 'todos.1', 300),
    node('d', 'user.name', 150),
  ];

  it('returns only nodes with an exact path match', () => {
    const result = queryByPath(nodes, 'todos.1');
    expect(result.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('returns empty array for unknown path', () => {
    expect(queryByPath(nodes, 'unknown')).toHaveLength(0);
  });

  it('returns results sorted by timestamp ascending', () => {
    const shuffled = [node('c', 'todos.1', 300), node('a', 'todos.1', 100)];
    const result = queryByPath(shuffled, 'todos.1');
    expect(result.map((n) => n.timestamp)).toEqual([100, 300]);
  });
});

// ── queryByPathPrefix ────────────────────────────────────────────────────────

describe('queryByPathPrefix', () => {
  const nodes = [
    node('a', 'todos.1', 100),
    node('b', 'todos.2', 200),
    node('c', 'user.name', 300),
    node('d', 'todos.1.done', 150),
  ];

  it('returns all nodes whose path starts with the prefix', () => {
    const result = queryByPathPrefix(nodes, 'todos.');
    expect(result.map((n) => n.id).sort()).toEqual(['a', 'b', 'd'].sort());
  });

  it('returns empty array when no paths match', () => {
    expect(queryByPathPrefix(nodes, 'missing.')).toHaveLength(0);
  });

  it('returns results sorted by timestamp ascending', () => {
    const result = queryByPathPrefix(nodes, 'todos.');
    expect(result.map((n) => n.timestamp)).toEqual([100, 150, 200]);
  });

  it('exact prefix without dot matches paths that literally start with prefix string', () => {
    // 'todos' matches 'todos.1', 'todos.2', 'todos.1.done'
    const result = queryByPathPrefix(nodes, 'todos');
    expect(result).toHaveLength(3);
  });
});

// ── queryByContext ───────────────────────────────────────────────────────────

describe('queryByContext', () => {
  const nodes = [
    node('a', 'p', 100, 'session:1'), // context set directly on node
    node('b', 'p', 200, null),         // context linked via edge
    node('c', 'p', 300, null),         // unrelated
  ];
  const edges = [ctxEdge('session:1', 'b')];

  it('returns nodes linked via context edge', () => {
    const result = queryByContext(nodes, edges, 'session:1');
    expect(result.map((n) => n.id)).toContain('b');
  });

  it('returns nodes with context field set to contextId', () => {
    const result = queryByContext(nodes, edges, 'session:1');
    expect(result.map((n) => n.id)).toContain('a');
  });

  it('does not return unrelated nodes', () => {
    const result = queryByContext(nodes, edges, 'session:1');
    expect(result.map((n) => n.id)).not.toContain('c');
  });

  it('returns empty array for unknown contextId', () => {
    expect(queryByContext(nodes, edges, 'session:99')).toHaveLength(0);
  });

  it('returns results sorted by timestamp ascending', () => {
    const result = queryByContext(nodes, edges, 'session:1');
    expect(result.map((n) => n.timestamp)).toEqual([100, 200]);
  });
});

// ── query (multi-filter) ─────────────────────────────────────────────────────

describe('query', () => {
  const nodes = [
    node('a', 'todos.1', 100),
    node('b', 'todos.2', 200),
    node('c', 'todos.1', 300),
    node('d', 'user.name', 250, 'session:1'),
    node('e', 'todos.1', 400),
  ];
  const edges = [ctxEdge('session:1', 'b')];

  it('returns all nodes when no filters are supplied', () => {
    expect(query(nodes, edges)).toHaveLength(nodes.length);
  });

  it('filters by startMs and endMs', () => {
    const result = query(nodes, edges, { startMs: 150, endMs: 350 });
    expect(result.map((n) => n.id).sort()).toEqual(['b', 'c', 'd'].sort());
  });

  it('filters by exact path', () => {
    const result = query(nodes, edges, { path: 'todos.1' });
    expect(result.map((n) => n.id)).toEqual(['a', 'c', 'e']);
  });

  it('filters by pathPrefix', () => {
    const result = query(nodes, edges, { pathPrefix: 'todos.' });
    expect(result).toHaveLength(4); // a, b, c, e
  });

  it('exact path takes precedence over pathPrefix when both are supplied', () => {
    // path is checked first; pathPrefix is ignored when path is set
    const result = query(nodes, edges, { path: 'todos.1', pathPrefix: 'user.' });
    expect(result.map((n) => n.id)).toEqual(['a', 'c', 'e']);
  });

  it('filters by contextId using edges', () => {
    const result = query(nodes, edges, { contextId: 'session:1' });
    expect(result.map((n) => n.id)).toContain('b');
    expect(result.map((n) => n.id)).toContain('d');
    expect(result.map((n) => n.id)).not.toContain('a');
  });

  it('combines time range and path', () => {
    const result = query(nodes, edges, { startMs: 200, endMs: 450, path: 'todos.1' });
    expect(result.map((n) => n.id)).toEqual(['c', 'e']);
  });

  it('returns results sorted by timestamp ascending', () => {
    const result = query(nodes, edges, { pathPrefix: 'todos.' });
    const ts = result.map((n) => n.timestamp);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it('applies limit', () => {
    const result = query(nodes, edges, { path: 'todos.1', limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('c');
  });

  it('applies offset', () => {
    const result = query(nodes, edges, { path: 'todos.1', offset: 1 });
    expect(result.map((n) => n.id)).toEqual(['c', 'e']);
  });

  it('applies both limit and offset for pagination', () => {
    const result = query(nodes, edges, { path: 'todos.1', offset: 1, limit: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });

  it('returns empty array when filters match nothing', () => {
    expect(query(nodes, edges, { path: 'nonexistent' })).toHaveLength(0);
  });
});
