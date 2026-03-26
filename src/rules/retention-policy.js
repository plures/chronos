/**
 * Retention Policy Rules
 *
 * Declarative Praxis rules governing when ChronicleNodes should be retained
 * or pruned from the chronicle:
 *   - age-based pruning  (discard nodes older than a configurable TTL)
 *   - count-based quota  (cap total nodes at a configurable maximum)
 *   - critical-path archival gate (never prune nodes on critical paths)
 *
 * @module @plures/chronos/rules/retention-policy
 */

import { defineRule, defineConstraint, defineModule, RuleResult } from '@plures/praxis';

// ── Defaults ───────────────────────────────────────────────────────────────

/**
 * Default maximum age in milliseconds before a node is eligible for pruning (7 days).
 *
 * @type {number}
 * @example
 * ```js
 * import { DEFAULT_TTL_MS } from '@plures/chronos/rules';
 * engine.step([{ tag: 'chronos.retention.auditRequested', payload: { nodes, ttlMs: DEFAULT_TTL_MS } }]);
 * ```
 */
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Default maximum number of nodes to retain in memory / persistent store.
 *
 * @type {number}
 * @example
 * ```js
 * import { DEFAULT_MAX_NODES } from '@plures/chronos/rules';
 * engine.step([{ tag: 'chronos.retention.auditRequested', payload: { nodes, maxNodes: DEFAULT_MAX_NODES } }]);
 * ```
 */
export const DEFAULT_MAX_NODES = 10_000;

// ── Events ─────────────────────────────────────────────────────────────────

/**
 * Event tag emitted when a retention audit is requested.
 *
 * @type {string}
 * @example
 * ```js
 * import { RETENTION_AUDIT_REQUESTED } from '@plures/chronos/rules';
 * engine.step([{
 *   tag: RETENTION_AUDIT_REQUESTED,
 *   payload: { nodes: chronicle._nodes, ttlMs: 7 * 24 * 60 * 60 * 1000 },
 * }]);
 * ```
 */
export const RETENTION_AUDIT_REQUESTED = 'chronos.retention.auditRequested';

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * Age-based pruning rule.
 *
 * Emits `chronos.retention.pruneEligible` for every node whose age exceeds
 * the configured TTL.  The caller is responsible for physically removing the
 * nodes identified in the `nodeIds` payload.
 *
 * @type {import('@plures/praxis').RuleDescriptor}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.retention.auditRequested',
 *   payload: { nodes: chronicle._nodes, ttlMs: 7 * 24 * 60 * 60 * 1000 },
 * }]);
 * // result.state.facts may contain { tag: 'chronos.retention.pruneEligible', payload: { reason: 'age', nodeIds: [...] } }
 * ```
 */
export const agePruningRule = defineRule({
  id: 'chronos.retention.agePruning',
  description: 'Mark nodes older than the configured TTL as eligible for pruning',
  eventTypes: RETENTION_AUDIT_REQUESTED,
  contract: {
    ruleId: 'chronos.retention.agePruning',
    behavior: 'Identifies stale nodes for pruning based on age threshold',
    examples: [
      { given: 'node is 8 days old with TTL=7d', when: 'audit requested', then: 'pruneEligible emitted for that node' },
      { given: 'node is 3 days old with TTL=7d', when: 'audit requested', then: 'no pruneEligible for that node' },
    ],
    invariants: [
      'Critical-path nodes (isCritical=true) must never be included in pruneEligible',
      'TTL must be a positive number',
    ],
  },
  impl: (state, events) => {
    const event = events.find((e) => e.tag === RETENTION_AUDIT_REQUESTED);
    if (!event) return RuleResult.skip('No retention audit event in batch');

    const { nodes, ttlMs = DEFAULT_TTL_MS, nowMs = Date.now() } = event.payload;

    if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      return RuleResult.skip('Invalid ttlMs: must be a positive, finite number');
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return RuleResult.noop('No nodes provided for audit');
    }

    const eligible = nodes
      .filter((n) => !n.isCritical && (nowMs - n.timestamp) > ttlMs)
      .map((n) => n.id);

    if (eligible.length === 0) {
      return RuleResult.noop('No nodes exceed the age threshold');
    }

    return RuleResult.emit([
      { tag: 'chronos.retention.pruneEligible', payload: { reason: 'age', nodeIds: eligible } },
    ]);
  },
});

/**
 * Count-based quota rule.
 *
 * When the total node count exceeds `maxNodes`, emits `chronos.retention.pruneEligible`
 * for the oldest non-critical nodes necessary to bring the count back within quota.
 *
 * @type {import('@plures/praxis').RuleDescriptor}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.retention.auditRequested',
 *   payload: { nodes: chronicle._nodes, maxNodes: 10_000 },
 * }]);
 * // result.state.facts may contain { tag: 'chronos.retention.pruneEligible', payload: { reason: 'quota', ... } }
 * ```
 */
export const quotaEnforcementRule = defineRule({
  id: 'chronos.retention.quotaEnforcement',
  description: 'Enforce maximum node count by marking oldest nodes as prunable',
  eventTypes: RETENTION_AUDIT_REQUESTED,
  contract: {
    ruleId: 'chronos.retention.quotaEnforcement',
    behavior: 'Trims the oldest nodes when total count exceeds the configured quota',
    examples: [
      { given: '10,100 nodes with maxNodes=10,000', when: 'audit requested', then: 'pruneEligible for 100 oldest' },
      { given: '5,000 nodes with maxNodes=10,000', when: 'audit requested', then: 'no pruneEligible emitted' },
    ],
    invariants: [
      'Critical-path nodes must never be pruned by quota enforcement',
      'The youngest nodes must be retained in preference to older ones',
    ],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === RETENTION_AUDIT_REQUESTED);
    if (!event) return RuleResult.skip('No retention audit event in batch');

    const { nodes, maxNodes = DEFAULT_MAX_NODES } = event.payload;
    if (!Array.isArray(nodes) || nodes.length <= maxNodes) {
      return RuleResult.noop('Node count within quota');
    }

    const nonCritical = nodes
      .filter((n) => !n.isCritical)
      .sort((a, b) => a.timestamp - b.timestamp);

    const excess = nodes.length - maxNodes;
    const toPrune = nonCritical.slice(0, excess).map((n) => n.id);

    if (toPrune.length === 0) {
      return RuleResult.noop('All nodes are critical; quota cannot be reduced');
    }

    const remainingExcess = excess - toPrune.length;
    const facts = [
      {
        tag: 'chronos.retention.pruneEligible',
        payload: {
          reason: 'quota',
          nodeIds: toPrune,
          remainingExcess: remainingExcess > 0 ? remainingExcess : 0,
        },
      },
    ];

    if (remainingExcess > 0) {
      facts.push({
        tag: 'chronos.retention.quotaStillExceeded',
        payload: {
          reason: 'quota',
          remainingExcess,
          maxNodes,
          totalNodes: nodes.length,
        },
      });
    }

    return RuleResult.emit(facts);
  },
});

/**
 * Archival gate rule.
 *
 * Emits `chronos.retention.archiveRequired` for critical-path nodes that exceed
 * a long-term archival age.  These nodes should be moved to cold storage rather
 * than deleted.
 *
 * @type {import('@plures/praxis').RuleDescriptor}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.retention.auditRequested',
 *   payload: { nodes: chronicle._nodes, archiveAfterMs: 30 * 24 * 60 * 60 * 1000 },
 * }]);
 * // result.state.facts may contain { tag: 'chronos.retention.archiveRequired', ... }
 * ```
 */
export const archivalGateRule = defineRule({
  id: 'chronos.retention.archivalGate',
  description: 'Flag critical-path nodes for archival when they exceed the archive age threshold',
  eventTypes: RETENTION_AUDIT_REQUESTED,
  contract: {
    ruleId: 'chronos.retention.archivalGate',
    behavior: 'Identifies critical nodes that should be archived rather than pruned',
    examples: [
      { given: 'critical node is 31 days old with archiveAfterMs=30d', when: 'audit requested', then: 'archiveRequired emitted' },
      { given: 'critical node is 10 days old with archiveAfterMs=30d', when: 'audit requested', then: 'no archiveRequired' },
    ],
    invariants: ['Non-critical nodes are never candidates for archival via this rule'],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === RETENTION_AUDIT_REQUESTED);
    if (!event) return RuleResult.skip('No retention audit event in batch');

    const {
      nodes,
      archiveAfterMs = 30 * 24 * 60 * 60 * 1000,
      nowMs = Date.now(),
    } = event.payload;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return RuleResult.noop('No nodes provided for archival check');
    }

    const toArchive = nodes
      .filter((n) => n.isCritical && (nowMs - n.timestamp) > archiveAfterMs)
      .map((n) => n.id);

    if (toArchive.length === 0) {
      return RuleResult.noop('No critical nodes exceed the archival age');
    }

    return RuleResult.emit([
      { tag: 'chronos.retention.archiveRequired', payload: { nodeIds: toArchive } },
    ]);
  },
});

// ── Constraints ────────────────────────────────────────────────────────────

/**
 * Ensures `maxNodes` is a positive integer when set on the context.
 *
 * @type {import('@plures/praxis').ConstraintDescriptor}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine({ initialContext: { maxNodes: 10_000 } });
 * // engine.checkConstraints() will surface violations if maxNodes is zero or negative
 * ```
 */
export const positiveQuotaConstraint = defineConstraint({
  id: 'chronos.retention.positiveQuota',
  description: 'maxNodes must be a positive integer when specified',
  contract: {
    ruleId: 'chronos.retention.positiveQuota',
    behavior: 'Guards against zero or negative quota configuration',
    examples: [
      { given: 'maxNodes=5000', when: 'constraint checked', then: 'passes' },
      { given: 'maxNodes=0', when: 'constraint checked', then: 'violation' },
    ],
    invariants: ['maxNodes must always be > 0'],
  },
  impl: (state) => {
    const { maxNodes } = state.context;
    if (maxNodes === undefined || maxNodes === null) return true;
    if (typeof maxNodes !== 'number' || maxNodes <= 0 || !Number.isInteger(maxNodes)) {
      return `maxNodes must be a positive integer, got ${maxNodes}`;
    }
    return true;
  },
});

// ── Module ─────────────────────────────────────────────────────────────────

/**
 * Retention Policy PraxisModule.
 *
 * Bundles the age pruning, quota enforcement, and archival gate rules
 * together with the `positiveQuotaConstraint`.
 *
 * @type {import('@plures/praxis').PraxisModule}
 * @example
 * ```js
 * import { retentionPolicyModule } from '@plures/chronos/rules';
 * registry.registerModule(retentionPolicyModule);
 * ```
 */
export const retentionPolicyModule = defineModule({
  rules: [agePruningRule, quotaEnforcementRule, archivalGateRule],
  constraints: [positiveQuotaConstraint],
  meta: { domain: 'retention-policy', version: '1.0.0' },
});
