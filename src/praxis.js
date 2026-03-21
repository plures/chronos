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
 * @returns {import('@plures/praxis').LogicEngine<ChronosContext>}
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
export { diffClassificationModule } from './rules/diff-classification.js';
export { retentionPolicyModule } from './rules/retention-policy.js';
export { alertingModule } from './rules/alerting.js';
export { integrityModule } from './rules/integrity.js';
export * from './rules/index.js';
