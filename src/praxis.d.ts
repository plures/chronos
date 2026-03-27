/**
 * Chronos × Praxis integration
 *
 * @module @plures/chronos/praxis
 */

import type { LogicEngine, PraxisRegistry, PraxisModule, RuleDescriptor, ConstraintDescriptor } from '@plures/praxis';

export type { LogicEngine, PraxisRegistry, PraxisModule, RuleDescriptor, ConstraintDescriptor };

/** Context object for the Chronos Praxis engine. */
export interface ChronosContext {
  /** Most recently classified diff metadata */
  lastClassified: object | null;
  /** Active quota ceiling */
  maxNodes: number | null;
  /** Active burst alert threshold */
  burstThreshold: number | null;
  /** Current causal chain being inspected */
  currentChain: unknown[] | null;
}

/** Options for `createChronosEngine`. */
export interface ChronosEngineOptions {
  /** Override initial context values */
  initialContext?: Partial<ChronosContext>;
}

/**
 * Create a Praxis engine pre-loaded with all Chronos rule modules.
 *
 * @param options - Engine options
 * @returns A LogicEngine instance configured for Chronos
 */
export declare function createChronosEngine(
  options?: ChronosEngineOptions,
): LogicEngine<ChronosContext>;

// Re-export all rule modules and event tag constants
/** Event tag emitted by Chronos whenever a new ChronicleNode is recorded. Re-exported for convenience. */
export { DIFF_RECORDED } from './rules/diff-classification.js';
/** Classifies a diff as create, update, or delete. Re-exported for convenience. */
export { classifyChangeTypeRule } from './rules/diff-classification.js';
/** Assigns severity level (info / warning / critical). Re-exported for convenience. */
export { assignSeverityRule } from './rules/diff-classification.js';
/** Scores the impact (0–100) of a state change. Re-exported for convenience. */
export { scoreImpactRule } from './rules/diff-classification.js';
/** Ensures every diff carries a valid change type. Re-exported for convenience. */
export { validChangeTypeConstraint } from './rules/diff-classification.js';
/** Praxis module bundling all diff-classification rules and constraints. Re-exported for convenience. */
export { diffClassificationModule } from './rules/diff-classification.js';

/** Event tag emitted when a retention audit is requested. Re-exported for convenience. */
export { RETENTION_AUDIT_REQUESTED } from './rules/retention-policy.js';
/** Default maximum age (ms) before a node is eligible for pruning. Re-exported for convenience. */
export { DEFAULT_TTL_MS } from './rules/retention-policy.js';
/** Default maximum number of nodes to retain. Re-exported for convenience. */
export { DEFAULT_MAX_NODES } from './rules/retention-policy.js';
/** Marks nodes older than the configured TTL as prunable. Re-exported for convenience. */
export { agePruningRule } from './rules/retention-policy.js';
/** Caps total nodes at the configured quota. Re-exported for convenience. */
export { quotaEnforcementRule } from './rules/retention-policy.js';
/** Prevents critical-path nodes from being pruned. Re-exported for convenience. */
export { archivalGateRule } from './rules/retention-policy.js';
/** Ensures the quota is a positive number. Re-exported for convenience. */
export { positiveQuotaConstraint } from './rules/retention-policy.js';
/** Praxis module bundling all retention-policy rules and constraints. Re-exported for convenience. */
export { retentionPolicyModule } from './rules/retention-policy.js';

/** Event tag emitted when an alerting evaluation is requested. Re-exported for convenience. */
export { ALERT_EVALUATION_REQUESTED } from './rules/alerting.js';
/** Default maximum number of diffs allowed in a burst window. Re-exported for convenience. */
export { DEFAULT_BURST_THRESHOLD } from './rules/alerting.js';
/** Default rolling burst-detection window in milliseconds. Re-exported for convenience. */
export { DEFAULT_BURST_WINDOW_MS } from './rules/alerting.js';
/** Default maximum proportion of critical-severity diffs before an alert fires. Re-exported for convenience. */
export { DEFAULT_CRITICAL_RATIO_THRESHOLD } from './rules/alerting.js';
/** Default Z-score above which an impact score is considered anomalous. Re-exported for convenience. */
export { DEFAULT_ANOMALY_Z_THRESHOLD } from './rules/alerting.js';
/** Fires an alert when the diff rate exceeds the configured burst threshold. Re-exported for convenience. */
export { burstDetectionRule } from './rules/alerting.js';
/** Fires an alert when critical-severity diffs exceed the configured ratio. Re-exported for convenience. */
export { criticalSpikeRule } from './rules/alerting.js';
/** Fires an alert when impact scores are significantly above the rolling mean. Re-exported for convenience. */
export { impactAnomalyRule } from './rules/alerting.js';
/** Ensures the burst threshold is a positive number. Re-exported for convenience. */
export { positiveBurstThresholdConstraint } from './rules/alerting.js';
/** Praxis module bundling all alerting rules and constraints. Re-exported for convenience. */
export { alertingModule } from './rules/alerting.js';

/** Event tag emitted when an integrity check is requested on a causal chain. Re-exported for convenience. */
export { INTEGRITY_CHECK_REQUESTED } from './rules/integrity.js';
/** Event tag emitted when a replay validation is requested. Re-exported for convenience. */
export { REPLAY_VALIDATION_REQUESTED } from './rules/integrity.js';
/** Verifies every causal link in a chain is present with no gaps. Re-exported for convenience. */
export { contiguityCheckRule } from './rules/integrity.js';
/** Detects temporal gaps larger than the configured threshold in a node sequence. Re-exported for convenience. */
export { gapDetectionRule } from './rules/integrity.js';
/** Verifies that replaying a diff sequence reproduces the expected final state. Re-exported for convenience. */
export { replayValidationRule } from './rules/integrity.js';
/** Ensures a causal chain does not contain duplicate node IDs. Re-exported for convenience. */
export { noDuplicateNodesConstraint } from './rules/integrity.js';
/** Praxis module bundling all integrity rules and constraints. Re-exported for convenience. */
export { integrityModule } from './rules/integrity.js';
