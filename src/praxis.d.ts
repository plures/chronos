/**
 * Chronos × Praxis integration
 *
 * @module @plures/chronos/praxis
 */

import type {
  ConstraintDescriptor,
  LogicEngine,
  PraxisModule,
  PraxisRegistry,
  RuleDescriptor,
} from "@plures/praxis";

export type {
  ConstraintDescriptor,
  LogicEngine,
  PraxisModule,
  PraxisRegistry,
  RuleDescriptor,
};

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
export {
  assignSeverityRule,
  classifyChangeTypeRule,
  DIFF_RECORDED,
  diffClassificationModule,
  scoreImpactRule,
  validChangeTypeConstraint,
} from "./rules/diff-classification.js";
export {
  agePruningRule,
  archivalGateRule,
  DEFAULT_MAX_NODES,
  DEFAULT_TTL_MS,
  positiveQuotaConstraint,
  quotaEnforcementRule,
  RETENTION_AUDIT_REQUESTED,
  retentionPolicyModule,
} from "./rules/retention-policy.js";
export {
  ALERT_EVALUATION_REQUESTED,
  alertingModule,
  burstDetectionRule,
  criticalSpikeRule,
  DEFAULT_ANOMALY_Z_THRESHOLD,
  DEFAULT_BURST_THRESHOLD,
  DEFAULT_BURST_WINDOW_MS,
  DEFAULT_CRITICAL_RATIO_THRESHOLD,
  impactAnomalyRule,
  positiveBurstThresholdConstraint,
} from "./rules/alerting.js";
export {
  contiguityCheckRule,
  gapDetectionRule,
  INTEGRITY_CHECK_REQUESTED,
  integrityModule,
  noDuplicateNodesConstraint,
  REPLAY_VALIDATION_REQUESTED,
  replayValidationRule,
} from "./rules/integrity.js";
export * from "./rules/index.js";
