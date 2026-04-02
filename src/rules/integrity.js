/**
 * Integrity Rules
 *
 * Declarative Praxis rules for chronicle chain integrity:
 *   - contiguity check  (no gaps in causal chains)
 *   - gap detection     (missing links between expected nodes)
 *   - replay validation (reconstructed state matches expected checksum)
 *
 * @module @plures/chronos/rules/integrity
 */

import {
  defineConstraint,
  defineModule,
  defineRule,
  RuleResult,
} from "@plures/praxis";

// ── Events ─────────────────────────────────────────────────────────────────

/**
 * Event tag emitted when an integrity check is requested on a causal chain.
 *
 * @type {string}
 * @example
 * ```js
 * import { INTEGRITY_CHECK_REQUESTED } from '@plures/chronos/rules';
 * engine.step([{
 *   tag: INTEGRITY_CHECK_REQUESTED,
 *   payload: { chain: chronicle._nodes, edges: chronicle._edges },
 * }]);
 * ```
 */
export const INTEGRITY_CHECK_REQUESTED = "chronos.integrity.checkRequested";

/**
 * Event tag emitted when a replay validation is requested.
 *
 * @type {string}
 * @example
 * ```js
 * import { REPLAY_VALIDATION_REQUESTED } from '@plures/chronos/rules';
 * engine.step([{
 *   tag: REPLAY_VALIDATION_REQUESTED,
 *   payload: { nodes: chronicle._nodes, expectedChecksum: 0xdeadbeef },
 * }]);
 * ```
 */
export const REPLAY_VALIDATION_REQUESTED =
  "chronos.integrity.replayValidationRequested";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Produce a simple deterministic hash of a serialisable value.
 * Used for replay checksum comparisons.
 *
 * @param {unknown} value
 * @returns {number}
 */
function simpleHash(value) {
  const str = JSON.stringify(value ?? null);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // unsigned 32-bit
}

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * Contiguity check rule.
 *
 * Verifies that every node in a causal chain has a corresponding `causes` edge
 * linking it to the previous node.  Emits `chronos.integrity.contiguous` on
 * success or `chronos.integrity.gap` for all missing links found in the chain.
 *
 * @type {object}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.integrity.checkRequested',
 *   payload: { chain: [nodeA, nodeB, nodeC], edges: chronicle._edges },
 * }]);
 * // result.state.facts contains { tag: 'chronos.integrity.contiguous', ... } or integrity.gap
 * ```
 */
export const contiguityCheckRule = defineRule({
  id: "chronos.integrity.contiguityCheck",
  description:
    "Verify that every causal link in a chain is present with no gaps",
  eventTypes: INTEGRITY_CHECK_REQUESTED,
  contract: {
    ruleId: "chronos.integrity.contiguityCheck",
    behavior: "Emits gap or contiguous fact after checking a chain of nodes",
    examples: [
      {
        given: "chain [A→B→C] with all edges present",
        when: "check requested",
        then: "integrity.contiguous emitted",
      },
      {
        given: "chain [A→B→C] with B→C edge missing",
        when: "check requested",
        then: "integrity.gap emitted for B→C",
      },
    ],
    invariants: [
      "A single-node chain is always contiguous",
      "Every gap must identify the fromId and toId of the missing link",
    ],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === INTEGRITY_CHECK_REQUESTED);
    if (!event) return RuleResult.skip("No integrity check event in batch");

    const { chain, edges } = event.payload;

    if (!Array.isArray(chain) || chain.length === 0) {
      return RuleResult.noop("Empty chain — nothing to check");
    }
    if (chain.length === 1) {
      return RuleResult.emit([
        {
          tag: "chronos.integrity.contiguous",
          payload: { chainLength: 1, gaps: [] },
        },
      ]);
    }

    const edgeSet = new Set(
      (edges ?? [])
        .filter((e) => e.type === "causes")
        .map((e) => `${e.from}:${e.to}`),
    );

    const gaps = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const fromId = chain[i].id;
      const toId = chain[i + 1].id;
      if (!edgeSet.has(`${fromId}:${toId}`)) {
        gaps.push({ fromId, toId });
      }
    }

    if (gaps.length > 0) {
      return RuleResult.emit([
        {
          tag: "chronos.integrity.gap",
          payload: {
            gaps,
            chainLength: chain.length,
            message:
              `Chronicle gap detected: ${gaps.length} missing causal link(s)`,
          },
        },
      ]);
    }

    return RuleResult.emit([
      {
        tag: "chronos.integrity.contiguous",
        payload: { chainLength: chain.length, gaps: [] },
      },
    ]);
  },
});

/**
 * Gap detection rule.
 *
 * Scans a time-ordered list of nodes for temporal gaps larger than a configured
 * threshold.  A temporal gap indicates potentially missing chronicle entries.
 *
 * @type {object}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.integrity.checkRequested',
 *   payload: { chain: chronicle._nodes, gapThresholdMs: 60_000 },
 * }]);
 * // result.state.facts may contain { tag: 'chronos.integrity.temporalGap', ... }
 * ```
 */
export const gapDetectionRule = defineRule({
  id: "chronos.integrity.gapDetection",
  description:
    "Detect temporal gaps larger than the configured threshold in a node sequence",
  eventTypes: INTEGRITY_CHECK_REQUESTED,
  contract: {
    ruleId: "chronos.integrity.gapDetection",
    behavior:
      "Emits temporalGap facts for suspiciously large time jumps between consecutive nodes",
    examples: [
      {
        given: "nodes A(t=0) B(t=100) C(t=900) with threshold=200ms",
        when: "check requested",
        then: "temporalGap emitted for B→C",
      },
      {
        given: "nodes A(t=0) B(t=100) C(t=200) with threshold=200ms",
        when: "check requested",
        then: "no temporal gap",
      },
    ],
    invariants: [
      "gapThresholdMs must be positive",
      "Nodes must be sorted by timestamp before gap detection",
    ],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === INTEGRITY_CHECK_REQUESTED);
    if (!event) return RuleResult.skip("No integrity check event in batch");

    const { chain, gapThresholdMs = 60_000 } = event.payload;

    if (
      typeof gapThresholdMs !== "number" || !Number.isFinite(gapThresholdMs) ||
      gapThresholdMs <= 0
    ) {
      return RuleResult.skip("gapThresholdMs must be a positive number");
    }

    if (!Array.isArray(chain) || chain.length < 2) {
      return RuleResult.noop("Not enough nodes for temporal gap detection");
    }

    const sorted = [...chain].sort((a, b) => a.timestamp - b.timestamp);
    const temporalGaps = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const delta = sorted[i + 1].timestamp - sorted[i].timestamp;
      if (delta > gapThresholdMs) {
        temporalGaps.push({
          beforeId: sorted[i].id,
          afterId: sorted[i + 1].id,
          deltaMs: delta,
        });
      }
    }

    if (temporalGaps.length > 0) {
      return RuleResult.emit([
        {
          tag: "chronos.integrity.temporalGap",
          payload: {
            gaps: temporalGaps,
            message:
              `Temporal gaps detected: ${temporalGaps.length} gap(s) exceeding ${gapThresholdMs}ms`,
          },
        },
      ]);
    }

    return RuleResult.noop("No temporal gaps detected");
  },
});

/**
 * Replay validation rule.
 *
 * Verifies that replaying a sequence of diffs produces a final state whose
 * checksum matches the expected value.  Emits `chronos.integrity.replayValid`
 * on success or `chronos.integrity.replayMismatch` on failure.
 *
 * @type {object}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine();
 * const result = engine.step([{
 *   tag: 'chronos.integrity.replayValidationRequested',
 *   payload: { nodes: chronicle._nodes, expectedChecksum: 123456789 },
 * }]);
 * // result.state.facts contains { tag: 'chronos.integrity.replayValid', ... } or replayMismatch
 * ```
 */
export const replayValidationRule = defineRule({
  id: "chronos.integrity.replayValidation",
  description:
    "Verify that replaying a diff sequence reproduces the expected final state",
  eventTypes: REPLAY_VALIDATION_REQUESTED,
  contract: {
    ruleId: "chronos.integrity.replayValidation",
    behavior:
      "Validates state reconstruction consistency by comparing checksums",
    examples: [
      {
        given: "replay of [set x=1, set x=2] matches expected state {x:2}",
        when: "replay requested",
        then: "replayValid emitted",
      },
      {
        given: "replay produces {x:3} but expected {x:2}",
        when: "replay requested",
        then: "replayMismatch emitted",
      },
    ],
    invariants: [
      "Replay must apply diffs in ascending timestamp order",
      "Every mismatch must include the expected and actual checksums",
    ],
  },
  impl: (_state, events) => {
    const event = events.find((e) => e.tag === REPLAY_VALIDATION_REQUESTED);
    if (!event) return RuleResult.skip("No replay validation event in batch");

    const { nodes, expectedChecksum, initialState = {} } = event.payload;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return RuleResult.noop("No nodes to replay");
    }

    // Sort by timestamp and apply diffs sequentially
    const sorted = [...nodes].sort((a, b) => a.timestamp - b.timestamp);
    const reconstructed = { ...initialState };

    for (const node of sorted) {
      if (node.diff && node.diff.after !== undefined) {
        if (node.diff.after === null) {
          // Chronos convention: `after: null` represents a deletion — remove the key
          delete reconstructed[node.path];
        } else {
          reconstructed[node.path] = node.diff.after;
        }
      }
    }

    const actualChecksum = simpleHash(reconstructed);

    if (actualChecksum === expectedChecksum) {
      return RuleResult.emit([
        {
          tag: "chronos.integrity.replayValid",
          payload: { checksum: actualChecksum, nodeCount: nodes.length },
        },
      ]);
    }

    return RuleResult.emit([
      {
        tag: "chronos.integrity.replayMismatch",
        payload: {
          expectedChecksum,
          actualChecksum,
          nodeCount: nodes.length,
          message:
            `Replay mismatch: expected checksum ${expectedChecksum}, got ${actualChecksum}`,
        },
      },
    ]);
  },
});

// ── Constraints ────────────────────────────────────────────────────────────

/**
 * Ensures that a causal chain does not contain duplicate node IDs.
 *
 * @type {object}
 * @example
 * ```js
 * import { createChronosEngine } from '@plures/chronos/praxis';
 * const engine = createChronosEngine({ initialContext: { currentChain: [nodeA, nodeB] } });
 * // engine.checkConstraints() will surface violations if currentChain has duplicate IDs
 * ```
 */
export const noDuplicateNodesConstraint = defineConstraint({
  id: "chronos.integrity.noDuplicateNodes",
  description: "A causal chain must not contain duplicate node IDs",
  contract: {
    ruleId: "chronos.integrity.noDuplicateNodes",
    behavior: "Prevents duplicate node IDs from corrupting a causal chain",
    examples: [
      {
        given: "chain [A, B, C] — all unique",
        when: "constraint checked",
        then: "passes",
      },
      {
        given: "chain [A, B, A] — A duplicated",
        when: "constraint checked",
        then: "violation",
      },
    ],
    invariants: ["All node IDs in a chain must be unique"],
  },
  impl: (state) => {
    const { currentChain } = state.context;
    if (!Array.isArray(currentChain)) return true;

    const ids = currentChain.map((n) => n.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
      return `Duplicate node IDs in chain: ${
        [...new Set(duplicates)].join(", ")
      }`;
    }
    return true;
  },
});

// ── Module ─────────────────────────────────────────────────────────────────

/**
 * Integrity PraxisModule.
 *
 * Bundles the contiguity check, gap detection, and replay validation rules
 * together with the `noDuplicateNodesConstraint`.
 *
 * @type {object}
 * @example
 * ```js
 * import { integrityModule } from '@plures/chronos/rules';
 * registry.registerModule(integrityModule);
 * ```
 */
export const integrityModule = defineModule({
  rules: [contiguityCheckRule, gapDetectionRule, replayValidationRule],
  constraints: [noDuplicateNodesConstraint],
  meta: { domain: "integrity", version: "1.0.0" },
});
