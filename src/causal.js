/**
 * Causal context — works in both Node.js and browser.
 *
 * Node: uses AsyncLocalStorage for true async propagation.
 * Browser: uses a simple stack (sufficient for sync + microtask patterns).
 *
 * @module @plures/chronos/causal
 */

let _als = null;
const _stack = []; // browser fallback

// Detect AsyncLocalStorage availability
function getALS() {
  if (_als) return _als;
  try {
    // Dynamic require to avoid bundler issues
    // deno-lint-ignore no-undef
    const hooks = globalThis.process?.versions?.node
      ? require("node:async_hooks")
      : null;
    if (hooks?.AsyncLocalStorage) {
      _als = new hooks.AsyncLocalStorage();
    }
  } catch {
    // Browser or restricted environment
  }
  return _als;
}

// Initialize eagerly
getALS();

/**
 * Get the current causal parent ID.
 *
 * @returns {string|null} The active causal parent ID, or `null` when outside a causal scope.
 *
 * @example
 * ```js
 * import { currentCause } from '@plures/chronos/causal';
 *
 * // Outside any causal scope
 * console.log(currentCause()); // null
 *
 * withCause('node:1', () => {
 *   console.log(currentCause()); // 'node:1'
 * });
 * ```
 */
export function currentCause() {
  if (_als) return _als.getStore()?.causeId ?? null;
  return _stack.length > 0 ? _stack[_stack.length - 1] : null;
}

/**
 * Run a function within a causal context.
 *
 * @param {string} causeId - ID of the parent node to set as the active cause
 * @param {function} fn - Synchronous or async function to execute inside the scope
 * @returns {*} The return value of `fn`
 *
 * @example
 * ```js
 * import { withCause, currentCause } from '@plures/chronos/causal';
 *
 * const parentNodeId = 'chrono:1699000000000-1';
 *
 * withCause(parentNodeId, () => {
 *   // All ChronicleNodes created here carry parentNodeId as their cause
 *   console.log(currentCause()); // 'chrono:1699000000000-1'
 * });
 *
 * // Async usage
 * await withCause(parentNodeId, async () => {
 *   await someAsyncOperation();
 *   console.log(currentCause()); // 'chrono:1699000000000-1'
 * });
 * ```
 */
export function withCause(causeId, fn) {
  if (_als) return _als.run({ causeId }, fn);

  // Browser fallback: stack-based
  _stack.push(causeId);
  let isAsync = false;
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      isAsync = true;
      return result.finally(() => {
        const idx = _stack.lastIndexOf(causeId);
        if (idx >= 0) _stack.splice(idx, 1);
      });
    }
    return result;
  } finally {
    // Only clean up synchronously when fn() did not return a promise; async
    // cleanup is handled by the result.finally() callback above.
    if (!isAsync) {
      const idx = _stack.lastIndexOf(causeId);
      if (idx >= 0) _stack.splice(idx, 1);
    }
  }
}
