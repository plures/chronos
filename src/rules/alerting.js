/**
 * Alerting Rules
 *
 * Declarative Praxis rules for threshold-based observability alerting:
 *   - high-frequency burst detection (too many diffs in a short window)
 *   - critical-severity spike detection (too many critical diffs)
 *   - anomaly detection (impact scores significantly above the rolling mean)
 *
 * @module @plures/chronos/rules/alerting
 */

import { defineRule, defineConstraint, defineModule, RuleResult } from '@plures/praxis';

// ── Defaults ───────────────────────────────────────────────────────────────

/**
 * Default maximum number of diffs allowed within a burst window.
 *
 * @type {number}
 * @example
 * ```js
 * import { DEFAULT_BURST_THRESHOLD } from '@plures/chronos/rules';
 * const engine = createChronosEngine({ initialContext: { burstThreshold: DEFAULT_BURST_THRESHOLD } });
 * ```
 */
export const DEFAULT_BURST_THRESHOLD = 50;

/**
 * Default rolling window (ms) for burst detection.
 *
 * @type {number}
 * @example
 * ```js
 * import { DEFAULT_BURST_WINDOW_MS } from '@plures/chronos/rules';
 * // Evaluate within the default 5-second window
 * engine.step([{ tag: 'chronos.alert.evaluationRequested', payload: { windowMs: DEFAULT_BURST_WINDOW_MS, recentNodes } }]);
 * ```
 */
export const DEFAULT_BURST_WINDOW_MS = 5_000;

/**
 * Default maximum proportion of critical-severity diffs before an alert fires.
 *
 * @type {number}
 * @example
 * ```js
 * import { DEFAULT_CRITICAL_RATIO_THRESHOLD } from '@plures/chronos/rules';
 * // 25% critical diffs triggers the alert by default
 * console.log(DEFAULT_CRITICAL_RATIO_THRESHOLD); // 0.25
 * ```
 */
export const DEFAULT_CRITICAL_RATIO_THRESHOLD = 0.25;

/**
 * Default Z-score above which an impact score is considered anomalous.
 *
 * @type {number}
 * @example
 * ```js
 * import { DEFAULT_ANOMALY_Z_THRESHOLD } from '@plures/chronos/rules';
 * // Impact scores more than 2.5 standard deviations above the mean trigger an alert
 * console.log(DEFAULT_ANOMALY_Z_THRESHOLD); // 2.5
 * ```
 */
export const DEFAULT_ANOMALY_Z_THRESHOLD = 2.5;

// ── Events ─────────────────────────────────────────────────────────────────

/**
 * Event tag emitted when an alerting evaluation is requested.
 *
 * @type {string}
 * @example
 * ```js
 * import { ALERT_EVALUATION_REQUESTED } from '@plures/chronos/rules';
 * engine.step([{ tag: ALERT_EVALUATION_REQUESTED, payload: { recentNodes: chronicle._nodes } }]);
 * ```
 */
export const ALERT_EVALUATION_REQUESTED = 'chronos.alert.evaluationRequested';

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * Burst detection rule.
 *
 * Fires `chronos.alert.burst` when the number of diffs recorded within
 * the rolling window exceeds `burstThreshold`.
 *
 * @type {import('@plures/praxis').RuleDescriptor}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.alert.evaluationRequested',
 *   payload: { recentNodes: chronicle._nodes, burstThreshold: 50 },
 * }]);
 * // result.state.facts may contain { tag: 'chronos.alert.burst', ... }
 * ```
 */
export const burstDetectionRule = defineRule({
  id: 'chronos.alert.burstDetection',
  description: 'Detect high-frequency diff bursts within a rolling time window',
  eventTypes: ALERT_EVALUATION_REQUESTED,
  contract: {
    ruleId: 'chronos.alert.burstDetection',
    behavior: 'Emits a burst alert when diff rate exceeds the configured threshold',
    examples: [
      { given: '60 diffs in 5 s with threshold=50', when: 'evaluation requested', then: 'alert.burst emitted' },
      { given: '30 diffs in 5 s with threshold=50', when: 'evaluation requested', then: 'no alert' },
    ],
    invariants: [
      'burstThreshold must be a positive integer',
      'Alert must include the actual count and threshold in its payload',
    ],
  },
  impl: (state, events) => {
    const event = events.find((e) => e.tag === ALERT_EVALUATION_REQUESTED);
    if (!event) return RuleResult.skip('No alert evaluation event in batch');

    const {
      recentNodes,
      windowMs = DEFAULT_BURST_WINDOW_MS,
      nowMs = Date.now(),
    } = event.payload;

    // Context is the authoritative source for burstThreshold; fall back to payload then default
    const burstThreshold =
      state && state.context && typeof state.context.burstThreshold === 'number'
        ? state.context.burstThreshold
        : (event.payload.burstThreshold ?? DEFAULT_BURST_THRESHOLD);

    if (!Array.isArray(recentNodes)) return RuleResult.skip('No nodes provided');

    const windowStart = nowMs - windowMs;
    const inWindow = recentNodes.filter((n) => n.timestamp >= windowStart);

    if (inWindow.length > burstThreshold) {
      return RuleResult.emit([
        {
          tag: 'chronos.alert.burst',
          payload: {
            count: inWindow.length,
            threshold: burstThreshold,
            windowMs,
            message: `Diff burst detected: ${inWindow.length} diffs in ${windowMs}ms (threshold=${burstThreshold})`,
          },
        },
      ]);
    }

    return RuleResult.noop(`Diff rate ${inWindow.length}/${burstThreshold} within threshold`);
  },
});

/**
 * Critical-severity spike rule.
 *
 * Fires `chronos.alert.criticalSpike` when the fraction of critical-severity
 * diffs among recent nodes exceeds `criticalRatioThreshold`.
 *
 * @type {import('@plures/praxis').RuleDescriptor}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.alert.evaluationRequested',
 *   payload: { recentNodes: chronicle._nodes, criticalRatioThreshold: 0.25 },
 * }]);
 * // result.state.facts may contain { tag: 'chronos.alert.criticalSpike', ... }
 * ```
 */
export const criticalSpikeRule = defineRule({
  id: 'chronos.alert.criticalSpike',
  description: 'Detect an unusual proportion of critical-severity diffs',
  eventTypes: ALERT_EVALUATION_REQUESTED,
  contract: {
    ruleId: 'chronos.alert.criticalSpike',
    behavior: 'Emits a critical-spike alert when critical diffs exceed the configured ratio',
    examples: [
      { given: '30% critical diffs with threshold=25%', when: 'evaluation requested', then: 'alert.criticalSpike emitted' },
      { given: '10% critical diffs with threshold=25%', when: 'evaluation requested', then: 'no alert' },
    ],
    invariants: [
      'criticalRatioThreshold must be between 0 and 1',
      'At least one node must be present to compute a meaningful ratio',
    ],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === ALERT_EVALUATION_REQUESTED);
    if (!event) return RuleResult.skip('No alert evaluation event in batch');

    const {
      recentNodes,
      criticalRatioThreshold: rawCriticalRatioThreshold = DEFAULT_CRITICAL_RATIO_THRESHOLD,
    } = event.payload;

    if (!Array.isArray(recentNodes) || recentNodes.length === 0) {
      return RuleResult.noop('No nodes to evaluate');
    }

    const criticalRatioThreshold = Number(rawCriticalRatioThreshold);
    if (!Number.isFinite(criticalRatioThreshold)) {
      return RuleResult.skip('Invalid criticalRatioThreshold: must be a finite number between 0 and 1');
    }
    if (criticalRatioThreshold < 0 || criticalRatioThreshold > 1) {
      return RuleResult.skip(
        `Invalid criticalRatioThreshold: must be between 0 and 1 (received ${String(rawCriticalRatioThreshold)})`
      );
    }

    const criticalCount = recentNodes.filter((n) => n.severity === 'critical').length;
    const ratio = criticalCount / recentNodes.length;

    if (ratio > criticalRatioThreshold) {
      return RuleResult.emit([
        {
          tag: 'chronos.alert.criticalSpike',
          payload: {
            ratio,
            threshold: criticalRatioThreshold,
            criticalCount,
            totalCount: recentNodes.length,
            message: `Critical diff spike: ${(ratio * 100).toFixed(1)}% of recent diffs are critical (threshold=${(criticalRatioThreshold * 100).toFixed(1)}%)`,
          },
        },
      ]);
    }

    return RuleResult.noop(`Critical ratio ${(ratio * 100).toFixed(1)}% within threshold`);
  },
});

/**
 * Impact-score anomaly detection rule.
 *
 * Fires `chronos.alert.impactAnomaly` when a diff's impact score is more than
 * `anomalyZThreshold` standard deviations above the rolling mean.
 *
 * @type {import('@plures/praxis').RuleDescriptor}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.alert.evaluationRequested',
 *   payload: { recentNodes: chronicle._nodes, latestNode: { id: 'n1', impactScore: 95 } },
 * }]);
 * // result.state.facts may contain { tag: 'chronos.alert.impactAnomaly', ... }
 * ```
 */
export const impactAnomalyRule = defineRule({
  id: 'chronos.alert.impactAnomaly',
  description: 'Detect impact-score outliers using Z-score deviation from rolling mean',
  eventTypes: ALERT_EVALUATION_REQUESTED,
  contract: {
    ruleId: 'chronos.alert.impactAnomaly',
    behavior: 'Emits an anomaly alert for diffs whose impact score is a statistical outlier',
    examples: [
      { given: 'impact score is 95 with mean=20 and σ=5, z=2.5', when: 'evaluation requested', then: 'alert.impactAnomaly emitted' },
      { given: 'impact score is 22 with mean=20 and σ=5', when: 'evaluation requested', then: 'no alert' },
    ],
    invariants: [
      'anomalyZThreshold must be positive',
      'At least 2 nodes are required for standard deviation computation',
    ],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === ALERT_EVALUATION_REQUESTED);
    if (!event) return RuleResult.skip('No alert evaluation event in batch');

    const {
      recentNodes,
      latestNode,
      anomalyZThreshold = DEFAULT_ANOMALY_Z_THRESHOLD,
    } = event.payload;

    if (!Array.isArray(recentNodes)) {
      return RuleResult.noop('Not enough historical nodes for anomaly detection');
    }
    if (!latestNode || typeof latestNode.impactScore !== 'number') {
      return RuleResult.skip('Latest node has no impact score');
    }

    const scores = recentNodes
      .map((n) => n.impactScore)
      .filter((score) => typeof score === 'number');

    if (scores.length < 2) {
      return RuleResult.noop('Not enough historical impact scores for anomaly detection');
    }
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return RuleResult.noop('Zero variance — no anomaly possible');

    const zScore = (latestNode.impactScore - mean) / stdDev;

    if (zScore > anomalyZThreshold) {
      return RuleResult.emit([
        {
          tag: 'chronos.alert.impactAnomaly',
          payload: {
            nodeId: latestNode.id,
            impactScore: latestNode.impactScore,
            mean,
            stdDev,
            zScore,
            threshold: anomalyZThreshold,
            message: `Impact anomaly on ${latestNode.id}: score=${latestNode.impactScore}, z=${zScore.toFixed(2)} (threshold=${anomalyZThreshold})`,
          },
        },
      ]);
    }

    return RuleResult.noop(`Impact score z=${zScore.toFixed(2)} within normal range`);
  },
});

// ── Constraints ────────────────────────────────────────────────────────────

/**
 * Ensures `burstThreshold` in context is a positive integer when set.
 *
 * @type {import('@plures/praxis').ConstraintDescriptor}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * // The constraint is pre-registered inside the engine
 * const engine = createChronosEngine({ initialContext: { burstThreshold: 50 } });
 * // Setting an invalid threshold: engine.checkConstraints() will surface a violation
 * ```
 */
export const positiveBurstThresholdConstraint = defineConstraint({
  id: 'chronos.alert.positiveBurstThreshold',
  description: 'burstThreshold must be a positive integer when specified',
  contract: {
    ruleId: 'chronos.alert.positiveBurstThreshold',
    behavior: 'Guards against non-positive or non-integer burst threshold configuration',
    examples: [
      { given: 'burstThreshold=50', when: 'constraint checked', then: 'passes' },
      { given: 'burstThreshold=-1', when: 'constraint checked', then: 'violation' },
    ],
    invariants: ['burstThreshold must be a positive integer'],
  },
  impl: (state) => {
    const { burstThreshold } = state.context;
    if (burstThreshold === undefined || burstThreshold === null) return true;
    if (
      typeof burstThreshold !== 'number' ||
      !Number.isInteger(burstThreshold) ||
      burstThreshold <= 0
    ) {
      return `burstThreshold must be a positive integer, got ${burstThreshold}`;
    }
    return true;
  },
});

// ── Module ─────────────────────────────────────────────────────────────────

/**
 * Alerting PraxisModule.
 *
 * Bundles the burst detection, critical spike, and impact anomaly rules
 * together with the `positiveBurstThresholdConstraint`.
 *
 * @type {import('@plures/praxis').PraxisModule}
 * @example
 * ```js
 * import { alertingModule } from '@plures/chronos/rules';
 * registry.registerModule(alertingModule);
 * ```
 */
export const alertingModule = defineModule({
  rules: [burstDetectionRule, criticalSpikeRule, impactAnomalyRule],
  constraints: [positiveBurstThresholdConstraint],
  meta: { domain: 'alerting', version: '1.0.0' },
});
