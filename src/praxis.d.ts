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
export { diffClassificationModule, DIFF_RECORDED, classifyChangeTypeRule, assignSeverityRule, scoreImpactRule, validChangeTypeConstraint } from './rules/diff-classification.js';
export { retentionPolicyModule, RETENTION_AUDIT_REQUESTED, DEFAULT_TTL_MS, DEFAULT_MAX_NODES, agePruningRule, quotaEnforcementRule, archivalGateRule, positiveQuotaConstraint } from './rules/retention-policy.js';
export { alertingModule, ALERT_EVALUATION_REQUESTED, DEFAULT_BURST_THRESHOLD, DEFAULT_BURST_WINDOW_MS, DEFAULT_CRITICAL_RATIO_THRESHOLD, DEFAULT_ANOMALY_Z_THRESHOLD, burstDetectionRule, criticalSpikeRule, impactAnomalyRule, positiveBurstThresholdConstraint } from './rules/alerting.js';
export { integrityModule, INTEGRITY_CHECK_REQUESTED, REPLAY_VALIDATION_REQUESTED, contiguityCheckRule, gapDetectionRule, replayValidationRule, noDuplicateNodesConstraint } from './rules/integrity.js';
export * from './rules/index.js';
