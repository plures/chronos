/**
 * Actor — identifies who/what made a change to PluresDB.
 *
 * Every write to PluresDB carries an actor. The actor determines:
 * - How the UI presents the change (AI changes get accept/reject affordance)
 * - How contracts evaluate the change (different rules for AI vs human)
 * - How the log gate records attribution
 * - Whether the change is provisional (AI) or committed (human)
 *
 * @module @plures/chronos/actor
 */

/**
 * Actor kinds. Extensible — new sources can be added.
 *
 * @readonly
 * @enum {string}
 */
export const ActorKind = /** @type {const} */ ({
  /** Human user making direct edits */
  HUMAN: "human",
  /** AI agent (LLM-driven) making changes */
  AI: "ai",
  /** System/automated process (cron, procedure, sync) */
  SYSTEM: "system",
  /** External source (API import, webhook, replication) */
  EXTERNAL: "external",
});

/**
 * @typedef {object} Actor
 * @property {string} kind      - ActorKind: "human", "ai", "system", "external"
 * @property {string} id        - Unique actor ID (e.g. "user:kbristol", "ai:cerebellum", "system:retention-pruner")
 * @property {string} [session] - Session/context ID for grouping related changes
 * @property {object} [metadata] - Additional actor metadata
 */

/**
 * Create an actor descriptor.
 *
 * @param {string} kind      - ActorKind
 * @param {string} id        - Unique actor identifier
 * @param {object} [options]
 * @param {string} [options.session] - Session/context ID
 * @param {object} [options.metadata] - Extra metadata
 * @returns {Actor}
 *
 * @example
 * ```js
 * import { createActor, ActorKind } from '@plures/chronos/actor';
 *
 * const human = createActor(ActorKind.HUMAN, 'user:kbristol');
 * const ai = createActor(ActorKind.AI, 'ai:cerebellum', { session: 'turn:abc123' });
 * const system = createActor(ActorKind.SYSTEM, 'system:retention-pruner');
 * ```
 */
export function createActor(kind, id, options = {}) {
  return {
    kind,
    id,
    session: options.session ?? null,
    metadata: options.metadata ?? null,
  };
}

/**
 * Check if an actor is AI-driven (provisional changes that need accept/reject).
 *
 * @param {Actor} actor
 * @returns {boolean}
 *
 * @example
 * ```js
 * import { isProvisional, createActor, ActorKind } from '@plures/chronos/actor';
 *
 * isProvisional(createActor(ActorKind.AI, 'ai:cerebellum'));    // true
 * isProvisional(createActor(ActorKind.HUMAN, 'user:kbristol')); // false
 * ```
 */
export function isProvisional(actor) {
  return actor.kind === ActorKind.AI;
}

/**
 * Check if the actor represents a human user.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isHuman(actor) {
  return actor.kind === ActorKind.HUMAN;
}

/**
 * Provisional state for a DB key — tracks AI-made changes awaiting human decision.
 *
 * When AI writes to a key, the change is stored as provisional. The UI shows
 * accept/reject. On accept → state becomes committed. On reject → state
 * reverts to the pre-AI value.
 *
 * @typedef {object} ProvisionalEntry
 * @property {string} key          - PluresDB key that was modified
 * @property {*}      committed    - Last human-accepted value
 * @property {*}      provisional  - AI-proposed value (current display state)
 * @property {Actor}  actor        - The AI actor that made the change
 * @property {number} timestamp    - When the provisional change was made
 * @property {string} [groupId]    - Groups related provisional changes (e.g. one AI turn)
 */

/**
 * Provisional state tracker — manages the keep/undo lifecycle for AI changes.
 *
 * Wraps a PluresDB store and interposes on writes to track which changes
 * are provisional (AI-authored) vs committed (human-authored or accepted).
 *
 * @example
 * ```js
 * import { createProvisionalTracker, createActor, ActorKind } from '@plures/chronos/actor';
 *
 * const tracker = createProvisionalTracker();
 * const ai = createActor(ActorKind.AI, 'ai:cerebellum', { session: 'turn:1' });
 * const human = createActor(ActorKind.HUMAN, 'user:kbristol');
 *
 * // Human commits a value (baseline)
 * tracker.commit('editor:file.ts', 'const x = 1;', human);
 *
 * // AI proposes a change
 * tracker.propose('editor:file.ts', 'const x = 1;\nconst y = 2;', ai);
 *
 * // UI shows the proposal with accept/reject
 * tracker.getPending('editor:file.ts');
 * // → { key, committed: 'const x = 1;', provisional: 'const x = 1;\nconst y = 2;', actor, ... }
 *
 * // Human accepts
 * tracker.accept('editor:file.ts');
 * // → provisional becomes committed, entry cleared
 *
 * // Or human rejects
 * tracker.reject('editor:file.ts');
 * // → revert to committed value, entry cleared
 * ```
 */
export function createProvisionalTracker() {
  /** @type {Map<string, ProvisionalEntry>} */
  const pending = new Map();

  /** @type {Map<string, *>} */
  const committedState = new Map();

  /**
   * Record a committed (human/accepted) value for a key.
   *
   * @param {string} key
   * @param {*} value
   * @param {Actor} actor
   */
  function commit(key, value, actor) {
    committedState.set(key, value);
    // If this key had a pending proposal and a human is committing, clear it
    if (pending.has(key) && actor.kind !== ActorKind.AI) {
      pending.delete(key);
    }
  }

  /**
   * Record a provisional (AI) change for a key.
   *
   * @param {string} key
   * @param {*} value
   * @param {Actor} actor
   * @param {string} [groupId] - Group related proposals together
   */
  function propose(key, value, actor, groupId) {
    const committed = committedState.get(key) ?? null;
    pending.set(key, {
      key,
      committed,
      provisional: value,
      actor,
      timestamp: Date.now(),
      groupId: groupId ?? actor.session ?? null,
    });
  }

  /**
   * Accept a provisional change — it becomes the committed state.
   *
   * @param {string} key
   * @returns {boolean} true if there was a pending proposal to accept
   */
  function accept(key) {
    const entry = pending.get(key);
    if (!entry) return false;
    committedState.set(key, entry.provisional);
    pending.delete(key);
    return true;
  }

  /**
   * Reject a provisional change — revert to committed state.
   *
   * @param {string} key
   * @returns {*} The committed value to revert to, or undefined if no pending
   */
  function reject(key) {
    const entry = pending.get(key);
    if (!entry) return undefined;
    pending.delete(key);
    return entry.committed;
  }

  /**
   * Accept all provisional changes in a group.
   *
   * @param {string} groupId
   * @returns {string[]} Keys that were accepted
   */
  function acceptGroup(groupId) {
    const accepted = [];
    for (const [key, entry] of pending) {
      if (entry.groupId === groupId) {
        committedState.set(key, entry.provisional);
        pending.delete(key);
        accepted.push(key);
      }
    }
    return accepted;
  }

  /**
   * Reject all provisional changes in a group.
   *
   * @param {string} groupId
   * @returns {Array<{key: string, revertTo: *}>} Keys and their revert values
   */
  function rejectGroup(groupId) {
    const rejected = [];
    for (const [key, entry] of pending) {
      if (entry.groupId === groupId) {
        pending.delete(key);
        rejected.push({ key, revertTo: entry.committed });
      }
    }
    return rejected;
  }

  /**
   * Get the pending proposal for a key.
   *
   * @param {string} key
   * @returns {ProvisionalEntry|undefined}
   */
  function getPending(key) {
    return pending.get(key);
  }

  /**
   * List all pending proposals.
   *
   * @returns {ProvisionalEntry[]}
   */
  function listPending() {
    return [...pending.values()];
  }

  /**
   * List all pending proposals in a group.
   *
   * @param {string} groupId
   * @returns {ProvisionalEntry[]}
   */
  function listGroup(groupId) {
    return [...pending.values()].filter((e) => e.groupId === groupId);
  }

  /**
   * Check if a key has a pending provisional change.
   *
   * @param {string} key
   * @returns {boolean}
   */
  function hasPending(key) {
    return pending.has(key);
  }

  /**
   * Get the current display value for a key (provisional if pending, else committed).
   *
   * @param {string} key
   * @returns {*}
   */
  function getDisplayValue(key) {
    const entry = pending.get(key);
    if (entry) return entry.provisional;
    return committedState.get(key) ?? null;
  }

  /**
   * Stats.
   *
   * @returns {{ pendingCount: number, committedKeys: number, groups: string[] }}
   */
  function stats() {
    const groups = new Set();
    for (const entry of pending.values()) {
      if (entry.groupId) groups.add(entry.groupId);
    }
    return {
      pendingCount: pending.size,
      committedKeys: committedState.size,
      groups: [...groups],
    };
  }

  return {
    commit,
    propose,
    accept,
    reject,
    acceptGroup,
    rejectGroup,
    getPending,
    listPending,
    listGroup,
    hasPending,
    getDisplayValue,
    stats,
  };
}
