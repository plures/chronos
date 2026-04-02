/**
 * Diff Classification Rules
 *
 * @module @plures/chronos/rules/diff-classification
 */

import type {
  ConstraintDescriptor,
  PraxisModule,
  RuleDescriptor,
} from "@plures/praxis";

/** Event tag emitted by Chronos whenever a new ChronicleNode is recorded. */
export declare const DIFF_RECORDED: "chronos.diff.recorded";

/** Classifies a diff as create, update, or delete based on before/after values. */
export declare const classifyChangeTypeRule: RuleDescriptor<unknown>;

/** Assigns severity level (info / warning / critical) to a classified diff. */
export declare const assignSeverityRule: RuleDescriptor<unknown>;

/** Scores the impact (0–100) of a state change. */
export declare const scoreImpactRule: RuleDescriptor<unknown>;

/** Ensures every diff.recorded event carries a valid change type. */
export declare const validChangeTypeConstraint: ConstraintDescriptor<unknown>;

/** Praxis module bundling all diff-classification rules and constraints. */
export declare const diffClassificationModule: PraxisModule<unknown>;
