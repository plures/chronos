/**
 * Alerting Rules
 *
 * @module @plures/chronos/rules/alerting
 */

import type { RuleDescriptor, ConstraintDescriptor, PraxisModule } from '@plures/praxis';

/** Default maximum number of diffs allowed within a burst window. */
export declare const DEFAULT_BURST_THRESHOLD: number;

/** Default rolling window (ms) for burst detection. */
export declare const DEFAULT_BURST_WINDOW_MS: number;

/** Default maximum proportion of critical-severity diffs before an alert fires. */
export declare const DEFAULT_CRITICAL_RATIO_THRESHOLD: number;

/** Default Z-score above which an impact score is considered anomalous. */
export declare const DEFAULT_ANOMALY_Z_THRESHOLD: number;

/** Event tag emitted when an alerting evaluation is requested. */
export declare const ALERT_EVALUATION_REQUESTED: 'chronos.alert.evaluationRequested';

/** Fires an alert when the diff rate exceeds the configured threshold. */
export declare const burstDetectionRule: RuleDescriptor<unknown>;

/** Fires an alert when critical-severity diffs exceed the configured ratio. */
export declare const criticalSpikeRule: RuleDescriptor<unknown>;

/** Fires an alert when impact scores are significantly above the rolling mean. */
export declare const impactAnomalyRule: RuleDescriptor<unknown>;

/** Ensures the burst threshold is a positive number. */
export declare const positiveBurstThresholdConstraint: ConstraintDescriptor<unknown>;

/** Praxis module bundling all alerting rules and constraints. */
export declare const alertingModule: PraxisModule<unknown>;
