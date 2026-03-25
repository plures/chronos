/**
 * Minimal JSON diff engine for Chronos.
 *
 * @module @plures/chronos/diff
 */

/**
 * Minimal structural diff between two JSON-serializable values.
 *
 * - `{ op: 'create', value }`               — null/undefined → value
 * - `{ op: 'delete', from }`                — value → null/undefined
 * - `{ op: 'replace', from, value }`        — primitive or type change
 * - `{ op: 'patch', changes: { key: diff }}` — object/array field-level diff
 */
export type DiffDescriptor =
  | { op: 'create'; value: unknown }
  | { op: 'delete'; from: unknown }
  | { op: 'replace'; from: unknown; value: unknown }
  | { op: 'patch'; changes: Record<string | number, DiffDescriptor> };

/**
 * Compute a minimal diff between two JSON-serializable values.
 *
 * @param before - Previous value
 * @param after  - New value
 * @returns Diff descriptor, or `null` if identical
 */
export declare function computeDiff(before: unknown, after: unknown): DiffDescriptor | null;
