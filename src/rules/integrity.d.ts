/**
 * Integrity Rules
 *
 * @module @plures/chronos/rules/integrity
 */

import type {
  ConstraintDescriptor,
  PraxisModule,
  RuleDescriptor,
} from "@plures/praxis";

/** Event tag emitted when an integrity check is requested on a causal chain. */
export declare const INTEGRITY_CHECK_REQUESTED:
  "chronos.integrity.checkRequested";

/** Event tag emitted when a replay validation is requested. */
export declare const REPLAY_VALIDATION_REQUESTED:
  "chronos.integrity.replayValidationRequested";

/** Verifies that every causal link in a chain is present with no gaps. */
export declare const contiguityCheckRule: RuleDescriptor<unknown>;

/** Detects temporal gaps larger than the configured threshold in a node sequence. */
export declare const gapDetectionRule: RuleDescriptor<unknown>;

/** Verifies that replaying a diff sequence reproduces the expected final state. */
export declare const replayValidationRule: RuleDescriptor<unknown>;

/** Ensures a causal chain does not contain duplicate node IDs. */
export declare const noDuplicateNodesConstraint: ConstraintDescriptor<unknown>;

/** Praxis module bundling all integrity rules and constraints. */
export declare const integrityModule: PraxisModule<unknown>;
