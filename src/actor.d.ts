/**
 * Actor — identifies who/what made a change to PluresDB.
 *
 * @module @plures/chronos/actor
 */

/** Actor kinds. */
export declare const ActorKind: {
  readonly HUMAN: "human";
  readonly AI: "ai";
  readonly SYSTEM: "system";
  readonly EXTERNAL: "external";
};

/** An actor descriptor. */
export interface Actor {
  /** ActorKind: "human", "ai", "system", "external" */
  kind: string;
  /** Unique actor ID */
  id: string;
  /** Session/context ID for grouping related changes */
  session: string | null;
  /** Additional metadata */
  metadata: Record<string, unknown> | null;
}

/** Create an actor descriptor. */
export declare function createActor(
  kind: string,
  id: string,
  options?: { session?: string; metadata?: Record<string, unknown> },
): Actor;

/** Check if an actor is AI-driven (provisional changes need accept/reject). */
export declare function isProvisional(actor: Actor): boolean;

/** Check if the actor represents a human user. */
export declare function isHuman(actor: Actor): boolean;

/** A provisional (AI-authored) change awaiting human decision. */
export interface ProvisionalEntry {
  /** PluresDB key that was modified */
  key: string;
  /** Last human-accepted value */
  committed: unknown;
  /** AI-proposed value (current display state) */
  provisional: unknown;
  /** The AI actor that made the change */
  actor: Actor;
  /** When the provisional change was made */
  timestamp: number;
  /** Groups related provisional changes */
  groupId: string | null;
}

/** Provisional state tracker — manages keep/undo lifecycle for AI changes. */
export interface ProvisionalTracker {
  /** Record a committed (human/accepted) value. */
  commit(key: string, value: unknown, actor: Actor): void;
  /** Record a provisional (AI) change. */
  propose(key: string, value: unknown, actor: Actor, groupId?: string): void;
  /** Accept a provisional change — becomes committed. */
  accept(key: string): boolean;
  /** Reject a provisional change — revert to committed. */
  reject(key: string): unknown;
  /** Accept all proposals in a group. */
  acceptGroup(groupId: string): string[];
  /** Reject all proposals in a group. */
  rejectGroup(groupId: string): Array<{ key: string; revertTo: unknown }>;
  /** Get the pending proposal for a key. */
  getPending(key: string): ProvisionalEntry | undefined;
  /** List all pending proposals. */
  listPending(): ProvisionalEntry[];
  /** List proposals in a group. */
  listGroup(groupId: string): ProvisionalEntry[];
  /** Check if a key has a pending proposal. */
  hasPending(key: string): boolean;
  /** Get display value (provisional if pending, else committed). */
  getDisplayValue(key: string): unknown;
  /** Stats. */
  stats(): { pendingCount: number; committedKeys: number; groups: string[] };
}

/** Create a provisional state tracker. */
export declare function createProvisionalTracker(): ProvisionalTracker;
