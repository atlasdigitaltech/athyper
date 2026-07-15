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
import { useQuery } from "@tanstack/react-query";

const MAX_BATCH = 100;

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
  const stableIds = recordIds.slice().sort().join(",");
  const queryKey  = ["comment-counts", entityCode, stableIds];

  const { data = {}, isLoading } = useQuery<Record<string, CommentCountEntry>>({
    queryKey,
    queryFn:   () => fetchCommentCounts(entityCode, recordIds),
    staleTime: 60_000,
    enabled:   recordIds.length > 0,
  });

  return { counts: data, isLoading };
}
