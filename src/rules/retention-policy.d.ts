/**
 * Retention Policy Rules
 *
 * @module @plures/chronos/rules/retention-policy
 */

import type { RuleDescriptor, ConstraintDescriptor, PraxisModule } from '@plures/praxis';

/** Default maximum age in milliseconds before a node is eligible for pruning (7 days). */
export declare const DEFAULT_TTL_MS: number;

/** Default maximum number of nodes to retain in memory / persistent store. */
export declare const DEFAULT_MAX_NODES: number;

/** Event tag emitted when a retention audit is requested. */
export declare const RETENTION_AUDIT_REQUESTED: 'chronos.retention.auditRequested';

/** Marks nodes older than the configured TTL as eligible for pruning. */
export declare const agePruningRule: RuleDescriptor<unknown>;

/** Caps total nodes at the configured maximum quota. */
export declare const quotaEnforcementRule: RuleDescriptor<unknown>;

/** Prevents critical-path nodes from being pruned. */
export declare const archivalGateRule: RuleDescriptor<unknown>;

/** Ensures the quota is a positive number. */
export declare const positiveQuotaConstraint: ConstraintDescriptor<unknown>;

/** Praxis module bundling all retention-policy rules and constraints. */
export declare const retentionPolicyModule: PraxisModule<unknown>;
