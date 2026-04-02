/**
 * Minimal JSON diff engine for Chronos.
 *
 * Computes the smallest structural diff between two JSON-serializable values.
 * Diff operations:
 *   - `{ op: 'create', value }`              — null/undefined → value
 *   - `{ op: 'delete', from }`               — value → null/undefined
 *   - `{ op: 'replace', from, value }`       — primitive or type change
 *   - `{ op: 'patch', changes: { key: diff }}` — object/array field-level diff
 *
 * @module @plures/chronos/diff
 */

/**
 * @typedef {{ op: 'create', value: * }
 *   | { op: 'delete', from: * }
 *   | { op: 'replace', from: *, value: * }
 *   | { op: 'patch', changes: Object.<string|number, DiffDescriptor> }} DiffDescriptor
 *
 * Minimal structural diff between two JSON-serializable values.
 * The `patch` variant uses string keys for object fields and numeric keys for array indices.
 */

/**
 * Compute a minimal diff between two JSON-serializable values.
 *
 * @param {*} before - Previous value
 * @param {*} after  - New value
 * @returns {DiffDescriptor|null} Diff descriptor, or null if identical
 *
 * @example
 * ```js
 * import { computeDiff } from '@plures/chronos/diff';
 *
 * // Create
 * computeDiff(null, { text: 'hello' });
 * // → { op: 'create', value: { text: 'hello' } }
 *
 * // Delete
 * computeDiff({ text: 'hello' }, null);
 * // → { op: 'delete', from: { text: 'hello' } }
 *
 * // Patch (object field change)
 * computeDiff({ text: 'hello' }, { text: 'world' });
 * // → { op: 'patch', changes: { text: { op: 'replace', from: 'hello', value: 'world' } } }
 *
 * // Identical values
 * computeDiff(42, 42);
 * // → null
 * ```
 */
export function computeDiff(before, after) {
  // Fast-path: strict equality (covers same primitives, same reference)
  if (before === after) return null;

  // Normalize null/undefined to null
  const b = before ?? null;
  const a = after ?? null;

  if (b === null && a === null) return null;

  // Create
  if (b === null) return { op: "create", value: a };

  // Delete
  if (a === null) return { op: "delete", from: b };

  const bType = Array.isArray(b) ? "array" : typeof b;
  const aType = Array.isArray(a) ? "array" : typeof a;

  // Type change — always a full replacement
  if (bType !== aType) return { op: "replace", from: b, value: a };

  if (bType === "object") return _diffObjects(b, a);
  if (bType === "array") return _diffArrays(b, a);

  // Primitive (number, string, boolean, bigint, symbol)
  return b === a ? null : { op: "replace", from: b, value: a };
}

/**
 * Field-level diff for plain objects.
 * @private
 */
function _diffObjects(b, a) {
  const changes = {};
  const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);

  for (const key of allKeys) {
    const d = computeDiff(b[key], a[key]);
    if (d !== null) changes[key] = d;
  }

  return Object.keys(changes).length > 0 ? { op: "patch", changes } : null;
}

/**
 * Element-level diff for arrays.
 * Reports a full replacement if lengths differ; per-index patch otherwise.
 * @private
 */
function _diffArrays(b, a) {
  if (b.length !== a.length) return { op: "replace", from: b, value: a };

  const changes = {};
  let hasChanges = false;

  for (let i = 0; i < b.length; i++) {
    const d = computeDiff(b[i], a[i]);
    if (d !== null) {
      changes[i] = d;
      hasChanges = true;
    }
  }

  return hasChanges ? { op: "patch", changes } : null;
}
