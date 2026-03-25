import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentCause, withCause } from '../src/causal.js';

// ── Node.js / AsyncLocalStorage path ─────────────────────────────────────────
// These tests exercise the ALS-backed implementation that runs in Node.js.

describe('causal (Node.js / ALS path)', () => {
  it('currentCause returns null outside any withCause scope', () => {
    expect(currentCause()).toBeNull();
  });

  it('withCause exposes the cause inside the sync callback', () => {
    let inner;
    withCause('cause:1', () => {
      inner = currentCause();
    });
    expect(inner).toBe('cause:1');
  });

  it('currentCause returns null again after the sync callback exits', () => {
    withCause('cause:x', () => {});
    expect(currentCause()).toBeNull();
  });

  it('withCause forwards the return value of the callback', () => {
    const result = withCause('cause:2', () => 42);
    expect(result).toBe(42);
  });

  it('withCause works with async callbacks and returns the promise', async () => {
    let inner;
    await withCause('cause:async', async () => {
      await new Promise((r) => setTimeout(r, 1));
      inner = currentCause();
    });
    expect(inner).toBe('cause:async');
  });

  it('nested withCause uses the innermost cause', () => {
    let outer, inner, afterInner;
    withCause('outer', () => {
      outer = currentCause();
      withCause('inner', () => {
        inner = currentCause();
      });
      afterInner = currentCause();
    });
    expect(outer).toBe('outer');
    expect(inner).toBe('inner');
    expect(afterInner).toBe('outer');
  });
});

// ── Browser / stack-fallback path ─────────────────────────────────────────────
// Force a fresh module load without AsyncLocalStorage so the _stack fallback
// (lines 40, 54-67 of causal.js) is exercised.

describe('causal (browser / stack fallback path)', () => {
  /** @type {typeof currentCause} */
  let cc;
  /** @type {typeof withCause} */
  let wc;

  beforeEach(async () => {
    // Clear the module cache so the next import re-runs module-level code.
    vi.resetModules();

    // Temporarily hide `process.versions.node` so getALS() cannot find
    // AsyncLocalStorage and leaves _als === null.
    const savedNode = globalThis.process?.versions?.node;
    if (globalThis.process?.versions) {
      delete globalThis.process.versions.node;
    }

    try {
      ({ currentCause: cc, withCause: wc } = await import('../src/causal.js'));
    } finally {
      // Always restore the environment to avoid poisoning other tests.
      if (globalThis.process?.versions && savedNode !== undefined) {
        globalThis.process.versions.node = savedNode;
      }
    }
  });

  it('currentCause returns null when the stack is empty', () => {
    expect(cc()).toBeNull();
  });

  it('withCause pushes the causeId onto the stack for sync callbacks', () => {
    let inner;
    wc('stack:1', () => {
      inner = cc();
    });
    expect(inner).toBe('stack:1');
  });

  it('currentCause returns null after the sync callback cleans up', () => {
    wc('stack:cleanup', () => {});
    expect(cc()).toBeNull();
  });

  it('withCause forwards the return value for sync callbacks', () => {
    const result = wc('stack:ret', () => 'hello');
    expect(result).toBe('hello');
  });

  it('withCause handles async callbacks and cleans up via .finally()', async () => {
    let inner;
    const prom = wc('stack:async', async () => {
      await new Promise((r) => setTimeout(r, 1));
      inner = cc();
      return 'done';
    });
    expect(typeof prom.then).toBe('function'); // returned a thenable
    await prom;
    expect(inner).toBe('stack:async');
    // Stack should be cleaned up after the promise settles.
    expect(cc()).toBeNull();
  });

  it('nested withCause uses the innermost stack entry', () => {
    let outer, inner;
    wc('s-outer', () => {
      outer = cc();
      wc('s-inner', () => {
        inner = cc();
      });
    });
    expect(outer).toBe('s-outer');
    expect(inner).toBe('s-inner');
    expect(cc()).toBeNull();
  });
});
