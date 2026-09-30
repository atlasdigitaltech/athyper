/** Roll back only this mutation's records, preserving concurrent unrelated results. */
export function rollbackBookmarks(current: ReadonlySet<string>, before: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(current);
  for (const id of ids) before.has(id) ? next.add(id) : next.delete(id);
  return next;
}
