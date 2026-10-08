import type { ListSortV1 } from "@athyper/contract-platform-entity-list";

// Editor draft comparisons (shared list layout foundation, section 6). Sort
// levels are applied in order and columns are displayed in order, so both
// comparisons stay order-sensitive: a reorder alone is a change.

/** The sort editor's draft differs from the applied sort, including by order. */
export function sortModified(
  draft: readonly ListSortV1[],
  applied: readonly ListSortV1[],
): boolean {
  return JSON.stringify(draft) !== JSON.stringify(applied);
}

/** The columns editor's draft differs from the visible columns, including by order. */
export function columnsModified(
  draft: readonly string[],
  applied: readonly string[],
): boolean {
  return JSON.stringify(draft) !== JSON.stringify(applied);
}
