/**
 * Diff Classification Rules
 *
 * Declarative Praxis rules for categorising PluresDB state diffs by:
 *   - change type  (create / update / delete)
 *   - severity     (info / warning / critical)
 *   - impact score (0–100)
 *
 * @module @plures/chronos/rules/diff-classification
 */

import { defineRule, defineConstraint, defineModule, RuleResult } from '@plures/praxis';

// ── Events ─────────────────────────────────────────────────────────────────

/** Event tag emitted by Chronos whenever a new ChronicleNode is recorded. */
export const DIFF_RECORDED = 'chronos.diff.recorded';

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * Determines the change type (create / update / delete) from before/after values.
 */
export const classifyChangeTypeRule = defineRule({
  id: 'chronos.diff.classifyChangeType',
  description: 'Classify a diff as create, update, or delete based on before/after values',
  eventTypes: DIFF_RECORDED,
  contract: {
    ruleId: 'chronos.diff.classifyChangeType',
    behavior: 'Assigns a change type to every recorded diff',
    examples: [
      { given: 'before is null', when: 'diff recorded', then: 'diff.classified emitted with type=create' },
      { given: 'after is null', when: 'diff recorded', then: 'diff.classified emitted with type=delete' },
      { given: 'before and after are both non-null', when: 'diff recorded', then: 'diff.classified emitted with type=update' },
    ],
    invariants: ['Every recorded diff must be classified as exactly one change type'],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === DIFF_RECORDED);
    if (!event) return RuleResult.skip('No diff.recorded event in batch');

    const { nodeId, path, before, after } = event.payload;
    let changeType;

    if (before === null || before === undefined) {
      changeType = 'create';
    } else if (after === null || after === undefined) {
      changeType = 'delete';
    } else {
      changeType = 'update';
    }

    return RuleResult.emit([
      { tag: 'chronos.diff.classified', payload: { nodeId, path, changeType } },
    ]);
  },
});

/**
 * Assigns a severity level (info / warning / critical) to a classified diff.
 *
 * Heuristics:
 *  - deletes are always at least `warning`
 *  - paths matching `*.critical` or `auth.*` / `security.*` are `critical`
 *  - everything else defaults to `info`
 */
export const assignSeverityRule = defineRule({
  id: 'chronos.diff.assignSeverity',
  description: 'Assign severity level to a classified diff',
  eventTypes: DIFF_RECORDED,
  contract: {
    ruleId: 'chronos.diff.assignSeverity',
    behavior: 'Emits a severity fact for every recorded diff',
    examples: [
      { given: 'diff type is delete', when: 'diff recorded', then: 'severity=warning emitted' },
      { given: 'path starts with auth.', when: 'diff recorded', then: 'severity=critical emitted' },
      { given: 'diff is a plain update', when: 'diff recorded', then: 'severity=info emitted' },
    ],
    invariants: ['Every diff must receive exactly one severity assignment'],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === DIFF_RECORDED);
    if (!event) return RuleResult.skip('No diff.recorded event in batch');

    const { nodeId, path, before, after } = event.payload;
    const isDelete = after === null || after === undefined;
    const isCriticalPath = /^(auth|security|permission|role)\b/.test(String(path ?? '')) ||
      String(path ?? '').endsWith('.critical');

    let severity;
    if (isCriticalPath) {
      severity = 'critical';
    } else if (isDelete) {
      severity = 'warning';
    } else {
      severity = 'info';
    }

    return RuleResult.emit([
      { tag: 'chronos.diff.severity', payload: { nodeId, path, severity } },
    ]);
  },
});

/**
 * Computes a 0–100 impact score for a diff.
 *
 * Factors:
 *  - critical severity: base 80
 *  - warning severity: base 50
 *  - info severity: base 10
 *  - value size delta (serialised byte difference, capped at +20)
 */
export const scoreImpactRule = defineRule({
  id: 'chronos.diff.scoreImpact',
  description: 'Compute a 0–100 impact score for a recorded diff',
  eventTypes: DIFF_RECORDED,
  contract: {
    ruleId: 'chronos.diff.scoreImpact',
    behavior: 'Emits an impact score fact for every diff',
    examples: [
      { given: 'critical auth path deletion', when: 'diff recorded', then: 'impact score ≥ 80' },
      { given: 'small info-level update', when: 'diff recorded', then: 'impact score ≤ 30' },
    ],
    invariants: ['Impact score must be in the range [0, 100]'],
  },
  impl: (_state, events) => {
    const diffEvents = events.filter((e) => e.tag === DIFF_RECORDED);
    if (diffEvents.length === 0) {
      return RuleResult.skip('No diff.recorded event in batch');
    }

    const impactFacts = diffEvents.map((event) => {
      const { nodeId, path, before, after } = event.payload;
      const isDelete = after === null || after === undefined;
      const pathString = String(path ?? '');
      const isCriticalPath =
        /^(auth|security|permission|role)\b/.test(pathString) ||
        pathString.endsWith('.critical');

      let base;
      if (isCriticalPath) {
        base = 80;
      } else if (isDelete) {
        base = 50;
      } else {
        base = 10;
      }

      // Bonus based on payload size delta (up to +20)
      const beforeSize = JSON.stringify(before ?? null).length;
      const afterSize = JSON.stringify(after ?? null).length;
      const sizeDelta = Math.abs(afterSize - beforeSize);
      const sizeBonus = Math.min(20, Math.floor(sizeDelta / 50));

      const score = Math.min(100, base + sizeBonus);

      return { tag: 'chronos.diff.impactScore', payload: { nodeId, path, score } };
    });

    return RuleResult.emit(impactFacts);
  },
});

// ── Constraints ────────────────────────────────────────────────────────────

/**
 * Ensures the `lastClassified` context field always holds a valid change type.
 */
export const validChangeTypeConstraint = defineConstraint({
  id: 'chronos.diff.validChangeType',
  description: 'Classified change type must be create, update, or delete',
  contract: {
    ruleId: 'chronos.diff.validChangeType',
    behavior: 'Prevents invalid change types from entering the chronicle',
    examples: [
      { given: 'changeType is update', when: 'constraint checked', then: 'passes' },
      { given: 'changeType is "mutation"', when: 'constraint checked', then: 'violation' },
    ],
    invariants: ['changeType must be one of: create, update, delete'],
  },
  impl: (state) => {
    const { lastClassified } = state.context;
    if (!lastClassified) return true;
    const valid = ['create', 'update', 'delete'];
    if (!valid.includes(lastClassified.changeType)) {
      return `Invalid changeType "${lastClassified.changeType}" — must be one of: ${valid.join(', ')}`;
    }
    return true;
  },
});

// ── Module ─────────────────────────────────────────────────────────────────

/**
 * Diff Classification PraxisModule.
 *
 * Bundle all diff-classification rules and constraints into a single module
 * that can be registered with a `PraxisRegistry`.
 *
 * @example
 * ```js
 * import { diffClassificationModule } from '@plures/chronos/rules';
 * registry.registerModule(diffClassificationModule);
 * ```
 */
export const diffClassificationModule = defineModule({
  rules: [classifyChangeTypeRule, assignSeverityRule, scoreImpactRule],
  constraints: [validChangeTypeConstraint],
  meta: { domain: 'diff-classification', version: '1.0.0' },
});
