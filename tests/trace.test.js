import { describe, it, expect } from 'vitest';
import { traceCausalChain } from '../src/trace.js';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function node(id, path = id, timestamp = 100) {
  return { id, path, timestamp };
}

function edge(from, to, type = 'causes') {
  return { from, to, type, timestamp: 100 };
}

// ── traceCausalChain ─────────────────────────────────────────────────────────

describe('traceCausalChain', () => {
  it('returns just the start node when there are no edges', () => {
    const nodes = [node('a')];
    const result = traceCausalChain(nodes, [], 'a');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns empty array for unknown nodeId', () => {
    const result = traceCausalChain([], [], 'ghost');
    expect(result).toHaveLength(0);
  });

  it('walks backward through a linear causal chain', () => {
    // root → mid → leaf
    const nodes = [node('root', 'step1'), node('mid', 'step2'), node('leaf', 'step3')];
    const edges = [edge('root', 'mid'), edge('mid', 'leaf')];

    const chain = traceCausalChain(nodes, edges, 'leaf', { direction: 'backward' });
    expect(chain.map((n) => n.id)).toEqual(['leaf', 'mid', 'root']);
  });

  it('walks forward through effects', () => {
    const nodes = [node('root'), node('e1'), node('e2')];
    const edges = [edge('root', 'e1'), edge('root', 'e2')];

    const effects = traceCausalChain(nodes, edges, 'root', { direction: 'forward' });
    expect(effects.length).toBe(3); // root + e1 + e2
    expect(effects[0].id).toBe('root');
    expect(effects.map((n) => n.id)).toContain('e1');
    expect(effects.map((n) => n.id)).toContain('e2');
  });

  it('respects maxDepth when walking backward', () => {
    // root → a → b → c (depth 3 from c)
    const nodes = [node('root'), node('a'), node('b'), node('c')];
    const edges = [edge('root', 'a'), edge('a', 'b'), edge('b', 'c')];

    const chain = traceCausalChain(nodes, edges, 'c', { direction: 'backward', maxDepth: 2 });
    // Should include c (depth 0), b (depth 1), a (depth 2) but NOT root (depth 3)
    expect(chain.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not revisit nodes in a diamond-shaped graph', () => {
    //   root
    //  /    \
    // a      b
    //  \    /
    //   leaf
    const nodes = [node('root'), node('a'), node('b'), node('leaf')];
    const edges = [
      edge('root', 'a'),
      edge('root', 'b'),
      edge('a', 'leaf'),
      edge('b', 'leaf'),
    ];

    const chain = traceCausalChain(nodes, edges, 'leaf', { direction: 'backward' });
    // leaf, a or b, root — each visited exactly once
    expect(chain).toHaveLength(4);
    expect(chain.map((n) => n.id).filter((id) => id === 'root')).toHaveLength(1);
  });

  it('can walk context edges with edgeType option', () => {
    const nodes = [node('root'), node('member1'), node('member2')];
    const edges = [
      { from: 'session:1', to: 'member1', type: 'context', timestamp: 100 },
      { from: 'session:1', to: 'member2', type: 'context', timestamp: 100 },
    ];

    // Use a synthetic "session:1" as start; it has no real node entry
    const result = traceCausalChain(
      [...nodes, { id: 'session:1', path: 'session', timestamp: 100 }],
      edges,
      'session:1',
      { direction: 'forward', edgeType: 'context' }
    );
    expect(result.map((n) => n.id)).toContain('member1');
    expect(result.map((n) => n.id)).toContain('member2');
  });

  it('ignores edges of different types when a specific edgeType is requested', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [
      edge('a', 'b', 'causes'),
      edge('a', 'c', 'context'), // should be ignored when edgeType === 'causes'
    ];

    const forward = traceCausalChain(nodes, edges, 'a', { direction: 'forward', edgeType: 'causes' });
    expect(forward.map((n) => n.id)).toContain('b');
    expect(forward.map((n) => n.id)).not.toContain('c');
  });
});
