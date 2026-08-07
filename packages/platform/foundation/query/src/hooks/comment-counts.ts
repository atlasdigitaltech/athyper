"use client";

import { useQueries } from "@tanstack/react-query";
import { type CommentCountEntry } from "@athyper/platform-api-client";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";
import { chunkStableIds } from "../_utils/chunk-ids";

export type { CommentCountEntry };

const BATCH_SIZE = 20;

/**
 * Batch comment counts (total + has_open) for a page of entity records.
 * Called once at list-page level — never per-row.
 */
export function useCommentCounts(entityCode: string, recordIds: string[]) {
  const batches = chunkStableIds(recordIds, BATCH_SIZE);

  const results = useQueries({
    queries: batches.map((ids) => ({
      queryKey:  queryKeys.collab.batchCount(entityCode, ids.slice().sort().join(",")),
      queryFn:   () =>
        clients.collab()
          .getBatchCommentCounts(entityCode, ids)
          .then((r) => r.counts ?? ({} as Record<string, CommentCountEntry>)),
      staleTime: 60_000,
      enabled:   ids.length > 0,
    })),
  });

  const counts = Object.assign(
    {},
    ...results.map((r) => r.data ?? {}),
  ) as Record<string, CommentCountEntry>;

  return { counts, isLoading: results.some((r) => r.isLoading) };
}
