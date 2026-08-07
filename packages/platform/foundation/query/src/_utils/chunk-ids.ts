/** Split a deduplicated list of record IDs into stable fixed-size batches. */
export function chunkStableIds(ids: string[], size: number): string[][] {
  const unique = [...new Set(ids.filter(Boolean))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    batches.push(unique.slice(i, i + size));
  }
  return batches;
}
