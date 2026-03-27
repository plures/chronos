/**
 * Chronos × Praxis integration
 *
 * Creates a pre-configured Praxis engine with all four Chronos rule modules
 * registered:
 *
 *   - diff-classification  — severity, change type, impact scoring
 *   - retention-policy     — snapshot pruning, quota enforcement, archival
 *   - alerting             — burst detection, critical spike, anomaly detection
 *   - integrity            — contiguity, gap detection, replay validation
 *
 * @module @plures/chronos/praxis
 *
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 *
 * const engine = createChronosEngine();
 *
 * // Classify a new diff
 * const result = engine.step([{
 *   tag: 'chronos.diff.recorded',
 *   payload: { nodeId: 'chrono:1', path: 'todos.1', before: null, after: { text: 'hello' } },
 * }]);
 *
 * console.log(result.state.facts);
 * // → [{ tag: 'chronos.diff.classified', payload: { changeType: 'create', ... } }, ...]
 * ```
 */

import { PraxisRegistry, createPraxisEngine } from '@plures/praxis';
import { diffClassificationModule } from './rules/diff-classification.js';
import { retentionPolicyModule } from './rules/retention-policy.js';
import { alertingModule } from './rules/alerting.js';
import { integrityModule } from './rules/integrity.js';

/**
 * @typedef {object} ChronosContext
 * @property {object|null}  [lastClassified]  - Most recently classified diff metadata
 * @property {number|null}  [maxNodes]         - Active quota ceiling
 * @property {number|null}  [burstThreshold]   - Active burst alert threshold
 * @property {Array|null}   [currentChain]     - Current causal chain being inspected
 */

/**
 * Create a Praxis engine pre-loaded with all Chronos rule modules.
 *
 * @param {object} [options]
 * @param {ChronosContext} [options.initialContext] - Override initial context values
 * @returns {object} Praxis LogicEngine pre-loaded with all Chronos rule modules
 *
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 *
 * const engine = createChronosEngine();
 *
 * // Classify a newly recorded diff
 * const result = engine.step([{
 *   tag: 'chronos.diff.recorded',
 *   payload: {
 *     nodeId: 'chrono:1',
 *     path: 'todos.1',
 *     before: null,
 *     after: { text: 'hello' },
 *   },
 * }]);
 *
 * console.log(result.state.facts);
 * // → [{ tag: 'chronos.diff.classified', payload: { changeType: 'create', ... } }, ...]
 * ```
 */
export function createChronosEngine(options = {}) {
  const registry = new PraxisRegistry();

  registry.registerModule(diffClassificationModule);
  registry.registerModule(retentionPolicyModule);
  registry.registerModule(alertingModule);
  registry.registerModule(integrityModule);

  return createPraxisEngine({
    initialContext: {
      lastClassified: null,
      maxNodes: null,
      burstThreshold: null,
      currentChain: null,
      ...(options.initialContext ?? {}),
    },
    registry,
    // Chronos is an append-only chronicle — preserve all emitted facts per step
    factDedup: 'append',
  });
}

// Re-export all rule modules and event tag constants for convenience
/**
 * Praxis module bundling all diff-classification rules and constraints.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 *
 * @example
 * ```js
 * import { diffClassificationModule } from '@plures/chronos/praxis';
 * registry.registerModule(diffClassificationModule);
 * ```
 */
export { diffClassificationModule } from './rules/diff-classification.js';

/**
 * Praxis module bundling all retention-policy rules and constraints.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 *
 * @example
 * ```js
 * import { retentionPolicyModule } from '@plures/chronos/praxis';
 * registry.registerModule(retentionPolicyModule);
 * ```
 */
export { retentionPolicyModule } from './rules/retention-policy.js';

/**
 * Praxis module bundling all alerting rules and constraints.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 *
 * @example
 * ```js
 * import { alertingModule } from '@plures/chronos/praxis';
 * registry.registerModule(alertingModule);
 * ```
 */
export { alertingModule } from './rules/alerting.js';

/**
 * Praxis module bundling all integrity rules and constraints.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 *
 * @example
 * ```js
 * import { integrityModule } from '@plures/chronos/praxis';
 * registry.registerModule(integrityModule);
 * ```
 */
export { integrityModule } from './rules/integrity.js';

// Re-export individual rule functions, constraints, and constants for convenience

/**
 * Event tag emitted by Chronos whenever a new ChronicleNode is recorded.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {string}
 */
export { DIFF_RECORDED } from './rules/diff-classification.js';

/**
 * Classifies a diff as `create`, `update`, or `delete` based on before/after values.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { classifyChangeTypeRule } from './rules/diff-classification.js';

/**
 * Assigns severity level (`info`, `warning`, or `critical`) to a classified diff.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { assignSeverityRule } from './rules/diff-classification.js';

/**
 * Scores the impact (0–100) of a state change.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { scoreImpactRule } from './rules/diff-classification.js';

/**
 * Ensures every `diff.recorded` event carries a valid change type.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { validChangeTypeConstraint } from './rules/diff-classification.js';

/**
 * Default maximum age (ms) before a node is eligible for pruning (7 days).
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {number}
 */
export { DEFAULT_TTL_MS } from './rules/retention-policy.js';

/**
 * Default maximum number of nodes to retain in memory / persistent store.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {number}
 */
export { DEFAULT_MAX_NODES } from './rules/retention-policy.js';

/**
 * Event tag emitted when a retention audit is requested.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {string}
 */
export { RETENTION_AUDIT_REQUESTED } from './rules/retention-policy.js';

/**
 * Marks nodes older than the configured TTL as eligible for pruning.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { agePruningRule } from './rules/retention-policy.js';

/**
 * Caps total nodes at the configured maximum quota.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { quotaEnforcementRule } from './rules/retention-policy.js';

/**
 * Prevents critical-path nodes from being pruned.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { archivalGateRule } from './rules/retention-policy.js';

/**
 * Ensures the quota is a positive number.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { positiveQuotaConstraint } from './rules/retention-policy.js';

/**
 * Default maximum number of diffs allowed within a burst window.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {number}
 */
export { DEFAULT_BURST_THRESHOLD } from './rules/alerting.js';

/**
 * Default rolling window (ms) for burst detection.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {number}
 */
export { DEFAULT_BURST_WINDOW_MS } from './rules/alerting.js';

/**
 * Default maximum proportion of critical-severity diffs before an alert fires.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {number}
 */
export { DEFAULT_CRITICAL_RATIO_THRESHOLD } from './rules/alerting.js';

/**
 * Default Z-score above which an impact score is considered anomalous.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {number}
 */
export { DEFAULT_ANOMALY_Z_THRESHOLD } from './rules/alerting.js';

/**
 * Event tag emitted when an alerting evaluation is requested.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {string}
 */
export { ALERT_EVALUATION_REQUESTED } from './rules/alerting.js';

/**
 * Fires an alert when the diff rate exceeds the configured burst threshold.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { burstDetectionRule } from './rules/alerting.js';

/**
 * Fires an alert when critical-severity diffs exceed the configured ratio.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { criticalSpikeRule } from './rules/alerting.js';

/**
 * Fires an alert when impact scores are significantly above the rolling mean.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { impactAnomalyRule } from './rules/alerting.js';

/**
 * Ensures the burst threshold is a positive number.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { positiveBurstThresholdConstraint } from './rules/alerting.js';

/**
 * Event tag emitted when an integrity check is requested on a causal chain.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {string}
 */
export { INTEGRITY_CHECK_REQUESTED } from './rules/integrity.js';

/**
 * Event tag emitted when a replay validation is requested.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {string}
 */
export { REPLAY_VALIDATION_REQUESTED } from './rules/integrity.js';

/**
 * Verifies that every causal link in a chain is present with no gaps.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { contiguityCheckRule } from './rules/integrity.js';

/**
 * Detects temporal gaps larger than the configured threshold in a node sequence.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { gapDetectionRule } from './rules/integrity.js';

/**
 * Verifies that replaying a diff sequence reproduces the expected final state.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { replayValidationRule } from './rules/integrity.js';

/**
 * Ensures a causal chain does not contain duplicate node IDs.
 *
 * Re-exported from `@plures/chronos/rules` for convenience.
 *
 * @type {object}
 */
export { noDuplicateNodesConstraint } from './rules/integrity.js';
