/**
 * Causal context — works in both Node.js and browser.
 *
 * Node: uses AsyncLocalStorage for true async propagation.
 * Browser: uses a simple stack (sufficient for sync + microtask patterns).
 *
 * @module @plures/chronos/causal
 */

/**
 * Get the current causal parent ID.
 *
 * @returns The active causal parent ID, or `null` when outside a causal scope.
 */
export declare function currentCause(): string | null;

/**
 * Run a function within a causal context.
 *
 * @param causeId - ID of the parent node to set as the active cause
 * @param fn - Synchronous or async function to execute inside the scope
 * @returns The return value of `fn`
 */
export declare function withCause<T>(causeId: string | null, fn: () => T): T;
