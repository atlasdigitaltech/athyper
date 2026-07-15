/**
 * computeInheritance — the canonical comparison primitive.
 *
 * Used everywhere the system needs to label a field's relationship to its
 * parent: BFF projections, form-runtime chip rendering, reports. Single
 * source of truth so chip vocabulary stays consistent across surfaces.
 */

import type { InheritanceLabel } from "./types";

export function computeInheritance<T>(
  child:  T | null | undefined,
  parent: T | null | undefined,
): InheritanceLabel {
  if (child == null && parent == null) return "unset";
  if (child == null)                   return "inherited_null";
  if (child === parent)                return "inherited_match";
  return "overridden";
}

/**
 * Equality helper that handles primitive values + simple object shapes.
 * Used internally by computeInheritance for object-valued fields (e.g.
 * dimension_set_id when both child and parent carry the same UUID).
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}
