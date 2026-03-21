import { describe, it, expect } from 'vitest';
import { RuleResult, PraxisRegistry, createPraxisEngine } from '@plures/praxis';

import {
  // diff-classification
  classifyChangeTypeRule,
  assignSeverityRule,
  scoreImpactRule,
  validChangeTypeConstraint,
  diffClassificationModule,
  DIFF_RECORDED,
  // retention-policy
  agePruningRule,
  quotaEnforcementRule,
  archivalGateRule,
  positiveQuotaConstraint,
  retentionPolicyModule,
  RETENTION_AUDIT_REQUESTED,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_NODES,
  // alerting
  burstDetectionRule,
  criticalSpikeRule,
  impactAnomalyRule,
  positiveBurstThresholdConstraint,
  alertingModule,
  ALERT_EVALUATION_REQUESTED,
  // integrity
  contiguityCheckRule,
  gapDetectionRule,
  replayValidationRule,
  noDuplicateNodesConstraint,
  integrityModule,
  INTEGRITY_CHECK_REQUESTED,
  REPLAY_VALIDATION_REQUESTED,
} from '../src/rules/index.js';

import { createChronosEngine } from '../src/praxis.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEngine(module) {
  const registry = new PraxisRegistry();
  registry.registerModule(module);
  return createPraxisEngine({ initialContext: {}, registry });
}

function stepWith(engine, tag, payload) {
  return engine.step([{ tag, payload }]);
}

function factsOf(result, tag) {
  return result.state.facts.filter((f) => f.tag === tag);
}

// ── diff-classification ──────────────────────────────────────────────────────

describe('diff-classification module', () => {
  describe('classifyChangeTypeRule', () => {
    it('classifies create (before=null)', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n1',
        path: 'todos.1',
        before: null,
        after: { text: 'hello' },
      });
      const facts = factsOf(result, 'chronos.diff.classified');
      expect(facts).toHaveLength(1);
      expect(facts[0].payload.changeType).toBe('create');
    });

    it('classifies delete (after=null)', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n2',
        path: 'todos.1',
        before: { text: 'hello' },
        after: null,
      });
      const facts = factsOf(result, 'chronos.diff.classified');
      expect(facts[0].payload.changeType).toBe('delete');
    });

    it('classifies update (both non-null)', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n3',
        path: 'todos.1',
        before: 'v1',
        after: 'v2',
      });
      const facts = factsOf(result, 'chronos.diff.classified');
      expect(facts[0].payload.changeType).toBe('update');
    });

    it('skips when no DIFF_RECORDED event is present', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = engine.step([{ tag: 'some.other.event', payload: {} }]);
      const facts = factsOf(result, 'chronos.diff.classified');
      expect(facts).toHaveLength(0);
    });
  });

  describe('assignSeverityRule', () => {
    it('assigns critical for auth paths', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n4',
        path: 'auth.token',
        before: 'old',
        after: 'new',
      });
      const facts = factsOf(result, 'chronos.diff.severity');
      expect(facts[0].payload.severity).toBe('critical');
    });

    it('assigns warning for deletes', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n5',
        path: 'todos.1',
        before: 'x',
        after: null,
      });
      const facts = factsOf(result, 'chronos.diff.severity');
      expect(facts[0].payload.severity).toBe('warning');
    });

    it('assigns info for plain updates', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n6',
        path: 'todos.1',
        before: 'a',
        after: 'b',
      });
      const facts = factsOf(result, 'chronos.diff.severity');
      expect(facts[0].payload.severity).toBe('info');
    });

    it('assigns critical for paths ending in .critical', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n7',
        path: 'system.status.critical',
        before: false,
        after: true,
      });
      const facts = factsOf(result, 'chronos.diff.severity');
      expect(facts[0].payload.severity).toBe('critical');
    });
  });

  describe('scoreImpactRule', () => {
    it('scores critical path at >= 80', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n8',
        path: 'security.key',
        before: null,
        after: 'new-key',
      });
      const facts = factsOf(result, 'chronos.diff.impactScore');
      expect(facts[0].payload.score).toBeGreaterThanOrEqual(80);
    });

    it('scores delete >= 50', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n9',
        path: 'data.item',
        before: 'v',
        after: null,
      });
      const facts = factsOf(result, 'chronos.diff.impactScore');
      expect(facts[0].payload.score).toBeGreaterThanOrEqual(50);
    });

    it('score is capped at 100', () => {
      const engine = makeEngine(diffClassificationModule);
      const result = stepWith(engine, DIFF_RECORDED, {
        nodeId: 'n10',
        path: 'auth.credentials',
        before: null,
        after: 'x'.repeat(10000),
      });
      const facts = factsOf(result, 'chronos.diff.impactScore');
      expect(facts[0].payload.score).toBeLessThanOrEqual(100);
    });
  });

  describe('validChangeTypeConstraint', () => {
    it('passes when lastClassified is null', () => {
      const result = validChangeTypeConstraint.impl({ context: { lastClassified: null } });
      expect(result).toBe(true);
    });

    it('passes for valid change types', () => {
      for (const ct of ['create', 'update', 'delete']) {
        const result = validChangeTypeConstraint.impl({
          context: { lastClassified: { changeType: ct } },
        });
        expect(result).toBe(true);
      }
    });

    it('rejects invalid change types', () => {
      const result = validChangeTypeConstraint.impl({
        context: { lastClassified: { changeType: 'mutation' } },
      });
      expect(typeof result).toBe('string');
      expect(result).toMatch(/mutation/);
    });
  });
});

// ── retention-policy ─────────────────────────────────────────────────────────

describe('retention-policy module', () => {
  const nowMs = Date.now();

  describe('agePruningRule', () => {
    it('marks stale non-critical nodes for pruning', () => {
      const engine = makeEngine(retentionPolicyModule);
      const nodes = [
        { id: 'old1', timestamp: nowMs - DEFAULT_TTL_MS - 1000, isCritical: false },
        { id: 'new1', timestamp: nowMs - 1000, isCritical: false },
      ];
      const result = stepWith(engine, RETENTION_AUDIT_REQUESTED, { nodes, nowMs });
      const facts = factsOf(result, 'chronos.retention.pruneEligible');
      expect(facts).toHaveLength(1);
      expect(facts[0].payload.nodeIds).toContain('old1');
      expect(facts[0].payload.nodeIds).not.toContain('new1');
    });

    it('never prunes critical nodes', () => {
      const engine = makeEngine(retentionPolicyModule);
      const nodes = [
        { id: 'critical1', timestamp: nowMs - DEFAULT_TTL_MS - 1000, isCritical: true },
      ];
      const result = stepWith(engine, RETENTION_AUDIT_REQUESTED, { nodes, nowMs });
      const facts = factsOf(result, 'chronos.retention.pruneEligible');
      expect(facts).toHaveLength(0);
    });

    it('emits noop when all nodes are within TTL', () => {
      const engine = makeEngine(retentionPolicyModule);
      const nodes = [{ id: 'fresh', timestamp: nowMs - 1000, isCritical: false }];
      const result = stepWith(engine, RETENTION_AUDIT_REQUESTED, { nodes, nowMs });
      const facts = factsOf(result, 'chronos.retention.pruneEligible');
      expect(facts).toHaveLength(0);
    });
  });

  describe('quotaEnforcementRule', () => {
    it('trims oldest nodes when over quota', () => {
      const engine = makeEngine(retentionPolicyModule);
      const nodes = Array.from({ length: 12 }, (_, i) => ({
        id: `n${i}`,
        timestamp: nowMs + i,
        isCritical: false,
      }));
      const result = stepWith(engine, RETENTION_AUDIT_REQUESTED, { nodes, maxNodes: 10, nowMs });
      const facts = factsOf(result, 'chronos.retention.pruneEligible');
      expect(facts).toHaveLength(1);
      expect(facts[0].payload.nodeIds).toHaveLength(2); // 12 - 10 = 2
      // Should be the two oldest
      expect(facts[0].payload.nodeIds).toContain('n0');
      expect(facts[0].payload.nodeIds).toContain('n1');
    });

    it('emits noop when within quota', () => {
      const engine = makeEngine(retentionPolicyModule);
      const nodes = [{ id: 'n0', timestamp: nowMs, isCritical: false }];
      const result = stepWith(engine, RETENTION_AUDIT_REQUESTED, { nodes, maxNodes: 10, nowMs });
      const facts = factsOf(result, 'chronos.retention.pruneEligible');
      expect(facts).toHaveLength(0);
    });
  });

  describe('archivalGateRule', () => {
    it('flags old critical nodes for archival', () => {
      const engine = makeEngine(retentionPolicyModule);
      const archiveAfterMs = 30 * 24 * 60 * 60 * 1000;
      const nodes = [
        { id: 'crit1', timestamp: nowMs - archiveAfterMs - 1000, isCritical: true },
        { id: 'crit2', timestamp: nowMs - 1000, isCritical: true },
      ];
      const result = stepWith(engine, RETENTION_AUDIT_REQUESTED, {
        nodes,
        archiveAfterMs,
        nowMs,
      });
      const facts = factsOf(result, 'chronos.retention.archiveRequired');
      expect(facts[0].payload.nodeIds).toContain('crit1');
      expect(facts[0].payload.nodeIds).not.toContain('crit2');
    });
  });

  describe('positiveQuotaConstraint', () => {
    it('passes when maxNodes is undefined', () => {
      expect(positiveQuotaConstraint.impl({ context: {} })).toBe(true);
    });

    it('passes for positive integers', () => {
      expect(positiveQuotaConstraint.impl({ context: { maxNodes: 5000 } })).toBe(true);
    });

    it('rejects zero', () => {
      const result = positiveQuotaConstraint.impl({ context: { maxNodes: 0 } });
      expect(typeof result).toBe('string');
    });

    it('rejects negatives', () => {
      const result = positiveQuotaConstraint.impl({ context: { maxNodes: -1 } });
      expect(typeof result).toBe('string');
    });
  });
});

// ── alerting ──────────────────────────────────────────────────────────────────

describe('alerting module', () => {
  const nowMs = Date.now();

  describe('burstDetectionRule', () => {
    it('fires burst alert when count exceeds threshold', () => {
      const engine = makeEngine(alertingModule);
      const recentNodes = Array.from({ length: 60 }, (_, i) => ({
        id: `n${i}`,
        timestamp: nowMs - i * 50, // all within 5s window
      }));
      const result = stepWith(engine, ALERT_EVALUATION_REQUESTED, {
        recentNodes,
        burstThreshold: 50,
        windowMs: 5000,
        nowMs,
      });
      const facts = factsOf(result, 'chronos.alert.burst');
      expect(facts).toHaveLength(1);
      expect(facts[0].payload.count).toBe(60);
    });

    it('does not fire when count is within threshold', () => {
      const engine = makeEngine(alertingModule);
      const recentNodes = Array.from({ length: 30 }, (_, i) => ({
        id: `n${i}`,
        timestamp: nowMs - i * 100,
      }));
      const result = stepWith(engine, ALERT_EVALUATION_REQUESTED, {
        recentNodes,
        burstThreshold: 50,
        windowMs: 5000,
        nowMs,
      });
      const facts = factsOf(result, 'chronos.alert.burst');
      expect(facts).toHaveLength(0);
    });
  });

  describe('criticalSpikeRule', () => {
    it('fires when critical ratio exceeds threshold', () => {
      const engine = makeEngine(alertingModule);
      const recentNodes = [
        { severity: 'critical' },
        { severity: 'critical' },
        { severity: 'critical' },
        { severity: 'info' },
        // 3/4 = 75% critical — above 25%
      ];
      const result = stepWith(engine, ALERT_EVALUATION_REQUESTED, {
        recentNodes,
        criticalRatioThreshold: 0.25,
      });
      const facts = factsOf(result, 'chronos.alert.criticalSpike');
      expect(facts).toHaveLength(1);
      expect(facts[0].payload.ratio).toBeCloseTo(0.75);
    });

    it('does not fire when within threshold', () => {
      const engine = makeEngine(alertingModule);
      const recentNodes = [
        { severity: 'critical' },
        { severity: 'info' },
        { severity: 'info' },
        { severity: 'info' },
        // 1/4 = 25% — not strictly above 25%
      ];
      const result = stepWith(engine, ALERT_EVALUATION_REQUESTED, {
        recentNodes,
        criticalRatioThreshold: 0.25,
      });
      const facts = factsOf(result, 'chronos.alert.criticalSpike');
      expect(facts).toHaveLength(0);
    });
  });

  describe('impactAnomalyRule', () => {
    it('fires for a Z-score outlier', () => {
      const engine = makeEngine(alertingModule);
      // mean=10, stdDev=2 → z=17.5 >> 2.5
      const recentNodes = [8, 10, 12, 10, 10].map((score, i) => ({
        id: `n${i}`,
        impactScore: score,
      }));
      const result = stepWith(engine, ALERT_EVALUATION_REQUESTED, {
        recentNodes,
        latestNode: { id: 'outlier', impactScore: 45 },
        anomalyZThreshold: 2.5,
      });
      const facts = factsOf(result, 'chronos.alert.impactAnomaly');
      expect(facts).toHaveLength(1);
      expect(facts[0].payload.zScore).toBeGreaterThan(2.5);
    });

    it('does not fire for a normal score', () => {
      const engine = makeEngine(alertingModule);
      const recentNodes = [8, 10, 12, 10, 10].map((score, i) => ({
        id: `n${i}`,
        impactScore: score,
      }));
      const result = stepWith(engine, ALERT_EVALUATION_REQUESTED, {
        recentNodes,
        latestNode: { id: 'normal', impactScore: 11 },
        anomalyZThreshold: 2.5,
      });
      const facts = factsOf(result, 'chronos.alert.impactAnomaly');
      expect(facts).toHaveLength(0);
    });

    it('skips when fewer than 2 nodes available', () => {
      const engine = makeEngine(alertingModule);
      const result = stepWith(engine, ALERT_EVALUATION_REQUESTED, {
        recentNodes: [{ id: 'n0', impactScore: 10 }],
        latestNode: { id: 'latest', impactScore: 90 },
        anomalyZThreshold: 2.5,
      });
      const facts = factsOf(result, 'chronos.alert.impactAnomaly');
      expect(facts).toHaveLength(0);
    });
  });

  describe('positiveBurstThresholdConstraint', () => {
    it('passes when not set', () => {
      expect(positiveBurstThresholdConstraint.impl({ context: {} })).toBe(true);
    });

    it('passes for positive number', () => {
      expect(positiveBurstThresholdConstraint.impl({ context: { burstThreshold: 50 } })).toBe(true);
    });

    it('rejects zero or negative', () => {
      const r0 = positiveBurstThresholdConstraint.impl({ context: { burstThreshold: 0 } });
      const rn = positiveBurstThresholdConstraint.impl({ context: { burstThreshold: -5 } });
      expect(typeof r0).toBe('string');
      expect(typeof rn).toBe('string');
    });
  });
});

// ── integrity ──────────────────────────────────────────────────────────────

describe('integrity module', () => {
  describe('contiguityCheckRule', () => {
    it('emits contiguous for a fully-linked chain', () => {
      const engine = makeEngine(integrityModule);
      const chain = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
      const edges = [
        { from: 'A', to: 'B', type: 'causes' },
        { from: 'B', to: 'C', type: 'causes' },
      ];
      const result = stepWith(engine, INTEGRITY_CHECK_REQUESTED, { chain, edges });
      expect(factsOf(result, 'chronos.integrity.contiguous')).toHaveLength(1);
      expect(factsOf(result, 'chronos.integrity.gap')).toHaveLength(0);
    });

    it('emits gap when a link is missing', () => {
      const engine = makeEngine(integrityModule);
      const chain = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
      const edges = [
        { from: 'A', to: 'B', type: 'causes' },
        // B→C is missing
      ];
      const result = stepWith(engine, INTEGRITY_CHECK_REQUESTED, { chain, edges });
      const gapFacts = factsOf(result, 'chronos.integrity.gap');
      expect(gapFacts).toHaveLength(1);
      expect(gapFacts[0].payload.gaps[0]).toEqual({ fromId: 'B', toId: 'C' });
    });

    it('treats a single-node chain as contiguous', () => {
      const engine = makeEngine(integrityModule);
      const result = stepWith(engine, INTEGRITY_CHECK_REQUESTED, {
        chain: [{ id: 'solo' }],
        edges: [],
      });
      expect(factsOf(result, 'chronos.integrity.contiguous')).toHaveLength(1);
    });
  });

  describe('gapDetectionRule', () => {
    it('detects large temporal gaps', () => {
      const engine = makeEngine(integrityModule);
      const chain = [
        { id: 'A', timestamp: 1000 },
        { id: 'B', timestamp: 2000 },
        { id: 'C', timestamp: 200000 }, // 198-second gap
      ];
      const result = stepWith(engine, INTEGRITY_CHECK_REQUESTED, {
        chain,
        gapThresholdMs: 60_000,
      });
      const facts = factsOf(result, 'chronos.integrity.temporalGap');
      expect(facts).toHaveLength(1);
      expect(facts[0].payload.gaps[0].deltaMs).toBe(198000);
    });

    it('emits noop when no temporal gaps exist', () => {
      const engine = makeEngine(integrityModule);
      const chain = [
        { id: 'A', timestamp: 1000 },
        { id: 'B', timestamp: 2000 },
        { id: 'C', timestamp: 3000 },
      ];
      const result = stepWith(engine, INTEGRITY_CHECK_REQUESTED, {
        chain,
        gapThresholdMs: 60_000,
      });
      expect(factsOf(result, 'chronos.integrity.temporalGap')).toHaveLength(0);
    });
  });

  describe('replayValidationRule', () => {
    function simpleHash(value) {
      const str = JSON.stringify(value ?? null);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
      }
      return hash >>> 0;
    }

    it('emits replayValid when checksum matches', () => {
      const engine = makeEngine(integrityModule);
      const nodes = [
        { id: 'n1', path: 'x', timestamp: 1, diff: { after: 1 } },
        { id: 'n2', path: 'x', timestamp: 2, diff: { after: 2 } },
      ];
      const expectedState = { x: 2 };
      const expectedChecksum = simpleHash(expectedState);

      const result = stepWith(engine, REPLAY_VALIDATION_REQUESTED, {
        nodes,
        expectedChecksum,
        initialState: {},
      });
      expect(factsOf(result, 'chronos.integrity.replayValid')).toHaveLength(1);
      expect(factsOf(result, 'chronos.integrity.replayMismatch')).toHaveLength(0);
    });

    it('emits replayMismatch on checksum mismatch', () => {
      const engine = makeEngine(integrityModule);
      const nodes = [
        { id: 'n1', path: 'x', timestamp: 1, diff: { after: 1 } },
      ];
      const result = stepWith(engine, REPLAY_VALIDATION_REQUESTED, {
        nodes,
        expectedChecksum: 99999,
        initialState: {},
      });
      expect(factsOf(result, 'chronos.integrity.replayMismatch')).toHaveLength(1);
    });
  });

  describe('noDuplicateNodesConstraint', () => {
    it('passes for unique IDs', () => {
      const result = noDuplicateNodesConstraint.impl({
        context: { currentChain: [{ id: 'A' }, { id: 'B' }] },
      });
      expect(result).toBe(true);
    });

    it('rejects duplicate IDs', () => {
      const result = noDuplicateNodesConstraint.impl({
        context: { currentChain: [{ id: 'A' }, { id: 'B' }, { id: 'A' }] },
      });
      expect(typeof result).toBe('string');
      expect(result).toMatch(/A/);
    });

    it('passes when chain is not set', () => {
      expect(noDuplicateNodesConstraint.impl({ context: {} })).toBe(true);
    });
  });
});

// ── createChronosEngine ────────────────────────────────────────────────────

describe('createChronosEngine', () => {
  it('creates an engine with all four modules registered', () => {
    const engine = createChronosEngine();
    expect(engine).toBeDefined();
    expect(typeof engine.step).toBe('function');
  });

  it('can classify a diff using the integrated engine', () => {
    const engine = createChronosEngine();
    const result = engine.step([
      {
        tag: DIFF_RECORDED,
        payload: { nodeId: 'n1', path: 'todos.1', before: null, after: { text: 'hello' } },
      },
    ]);
    const classified = result.state.facts.filter((f) => f.tag === 'chronos.diff.classified');
    expect(classified).toHaveLength(1);
    expect(classified[0].payload.changeType).toBe('create');
  });

  it('respects custom initialContext', () => {
    const engine = createChronosEngine({ initialContext: { maxNodes: 500 } });
    expect(engine.getContext().maxNodes).toBe(500);
  });
});
