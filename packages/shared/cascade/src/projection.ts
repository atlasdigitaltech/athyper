/**
 * projectInheritance — BFF projection helper.
 *
 * Computes the virtual `_inheritance` block for a child row given its parent
 * row and the cascade rules for the child entity. Output is NEVER persisted —
 * recomputed per request.
 *
 * Usage in a BFF route:
 *
 *   const pi   = await fetchPI(invoiceId);
 *   const pils = await fetchPILs(invoiceId);
 *   const defaults = await fetchFieldDefaults("purchase_invoice_line");
 *   return {
 *     ...pi,
 *     lines: pils.map(pil => ({
 *       ...pil,
 *       _inheritance: projectInheritance(pil, pi, defaults),
 *     })),
 *   };
 */

import { computeInheritance } from "./inheritance.js";
import type { DefaultsMap, InheritanceMap } from "./types.js";

export function projectInheritance(
  row:         Record<string, unknown>,
  parent:      Record<string, unknown>,
  defaultsMap: DefaultsMap,
): InheritanceMap {
  const result: InheritanceMap = {};

  for (const [field, defaults] of Object.entries(defaultsMap)) {
    const detect = defaults.override_detection;
    if (!detect) continue;   // fields with NULL override_detection don't get a label

    const compareTo  = detect.compare_to;
    const parentKey  = compareTo.startsWith("parent.") ? compareTo.slice("parent.".length) : compareTo;
    const childVal   = row[field] ?? null;
    const parentVal  = parent[parentKey] ?? null;

    result[field] = computeInheritance(childVal, parentVal);
  }

  return result;
}

/**
 * Batch variant — efficient when projecting many children against one parent.
 */
export function projectInheritanceBatch(
  rows:        Array<Record<string, unknown>>,
  parent:      Record<string, unknown>,
  defaultsMap: DefaultsMap,
): Array<{ row: Record<string, unknown>; inheritance: InheritanceMap }> {
  return rows.map((row) => ({
    row,
    inheritance: projectInheritance(row, parent, defaultsMap),
  }));
}
