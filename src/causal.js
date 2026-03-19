/**
 * Causal context — works in both Node.js and browser.
 *
 * Node: uses AsyncLocalStorage for true async propagation.
 * Browser: uses a simple stack (sufficient for sync + microtask patterns).
 */

let _als = null;
const _stack = []; // browser fallback

// Detect AsyncLocalStorage availability
function getALS() {
  if (_als) return _als;
  try {
    // Dynamic require to avoid bundler issues
    const hooks = globalThis.process?.versions?.node
      ? require('node:async_hooks')
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
 */
export function currentCause() {
  if (_als) return _als.getStore()?.causeId ?? null;
  return _stack.length > 0 ? _stack[_stack.length - 1] : null;
}

/**
 * Run a function within a causal context.
 */
export function withCause(causeId, fn) {
  if (_als) return _als.run({ causeId }, fn);

  // Browser fallback: stack-based
  _stack.push(causeId);
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        const idx = _stack.lastIndexOf(causeId);
        if (idx >= 0) _stack.splice(idx, 1);
      });
    }
    return result;
  } finally {
    // Sync cleanup
    const idx = _stack.lastIndexOf(causeId);
    if (idx >= 0) _stack.splice(idx, 1);
  }
}
