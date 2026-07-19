/**
 * useCommentCounts — batch comment counts for a page of entity records.
 *
 * Fetches total + has_open (unresolved) comment counts for all visible row
 * IDs in one request. Results are stable for 60s (counts don't need
 * real-time accuracy on the list view).
 *
 * Called once at runtime-list page level — never per-row.
 * Max 100 IDs per batch; splits automatically when page is larger.
 */
import { useQueries } from "@tanstack/react-query";

const MAX_BATCH = 100;
const CACHE_BATCH_SIZE = 20;

export interface CommentCountEntry {
  total:   number;
  hasOpen: boolean;
}

async function fetchCommentCounts(
  entityCode: string,
  recordIds: string[],
): Promise<Record<string, CommentCountEntry>> {
  if (recordIds.length === 0) return {};

  const batches: string[][] = [];
  for (let i = 0; i < recordIds.length; i += MAX_BATCH) {
    batches.push(recordIds.slice(i, i + MAX_BATCH));
  }

  type RawCounts = Record<string, { total: number; hasOpen: boolean }>;

  const results = await Promise.all(
    batches.map((ids) =>
      fetch(
        `/api/collab/comments/batch-count?entity_type=${encodeURIComponent(entityCode)}&ids=${ids.join(",")}`,
        { cache: "no-store" },
      )
        .then((r) => r.json() as Promise<{ counts?: RawCounts }>)
        .then((d) => d.counts ?? ({} as RawCounts))
        .catch(() => ({} as RawCounts)),
    ),
  );

  return Object.assign({}, ...results) as Record<string, CommentCountEntry>;
}

export function useCommentCounts(entityCode: string, recordIds: string[]) {
  const batches = chunkStableRecordIds(recordIds, CACHE_BATCH_SIZE);
  const results = useQueries({
    queries: batches.map((ids) => ({
      queryKey: ["comment-counts", entityCode, ids.slice().sort().join(",")],
      queryFn:  () => fetchCommentCounts(entityCode, ids),
      staleTime: 60_000,
      enabled: ids.length > 0,
    })),
  });

  const counts = Object.assign({}, ...results.map((result) => result.data ?? {})) as Record<string, CommentCountEntry>;
  return { counts, isLoading: results.some((result) => result.isLoading) };
}

export function chunkStableRecordIds(recordIds: string[], size: number): string[][] {
  const uniqueIds = [...new Set(recordIds.filter(Boolean))];
  const batches: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += size) {
    batches.push(uniqueIds.slice(index, index + size));
  }
  return batches;
}
