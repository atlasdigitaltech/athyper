"use client";

import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type BookmarkSnapshot, type BookmarkListGroup } from "@athyper/platform-api-client";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";
import { chunkStableIds } from "../_utils/chunk-ids";

export type { BookmarkSnapshot, BookmarkListGroup };
export type { BookmarkListItem } from "@athyper/platform-api-client";

const BATCH_SIZE = 20;

/**
 * Batch bookmark state for a page of entity records.
 * Called once at list-page level — never per-row.
 * Max 100 IDs per server request; splits automatically.
 */
export function useRecordBookmarks(
  entityCode: string,
  recordIds:  string[],
) {
  const qc      = useQueryClient();
  const batches = chunkStableIds(recordIds, BATCH_SIZE);

  const results = useQueries({
    queries: batches.map((ids) => ({
      queryKey:  queryKeys.collab.batchCount(entityCode, ids.slice().sort().join(",")),
      queryFn:   () =>
        clients.collab()
          .getBatchBookmarks(entityCode, ids)
          .then((r) => r.bookmarked_ids ?? []),
      staleTime: 60_000,
      enabled:   ids.length > 0,
    })),
  });

  const bookmarkedIds  = new Set(results.flatMap((r) => r.data ?? []));
  const queryPrefix    = ["collab", "comment-counts", entityCode] as const;

  const { mutate, isPending } = useMutation({
    mutationFn: ({ recordId, snapshot }: { recordId: string; snapshot?: BookmarkSnapshot }) =>
      clients.collab().toggleBookmark({
        entity_code:     entityCode,
        record_id:       recordId,
        label_snapshot:  snapshot?.displayName,
      }),

    onMutate: async ({ recordId }) => {
      await qc.cancelQueries({ queryKey: [...queryPrefix] });
      const previous = qc.getQueriesData<string[]>({ queryKey: [...queryPrefix] });

      if (bookmarkedIds.has(recordId)) {
        qc.setQueriesData<string[]>({ queryKey: [...queryPrefix] }, (cur = []) =>
          cur.filter((id) => id !== recordId));
      } else {
        const targetBatch = batches.find((b) => b.includes(recordId));
        if (targetBatch) {
          const targetKey = queryKeys.collab.batchCount(
            entityCode,
            targetBatch.slice().sort().join(","),
          );
          qc.setQueryData<string[]>(targetKey, (cur = []) => [
            ...new Set([...cur, recordId]),
          ]);
        }
      }

      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      for (const [key, value] of ctx?.previous ?? []) qc.setQueryData(key, value);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: [...queryPrefix] });
      qc.invalidateQueries({ queryKey: queryKeys.collab.bookmarks });
    },
  });

  const toggle = useCallback(
    (recordId: string, snapshot?: BookmarkSnapshot) => mutate({ recordId, snapshot }),
    [mutate],
  );

  return {
    bookmarkedIds,
    toggle,
    isLoading: results.some((r) => r.isLoading),
    isPending,
  };
}

function removeFromGroups(
  groups:     BookmarkListGroup[],
  entityCode: string,
  recordId:   string,
): BookmarkListGroup[] {
  return groups
    .map((g) => {
      if (g.entityCode !== entityCode) return g;
      const items = g.items.filter((i) => i.recordId !== recordId);
      return { ...g, items, count: items.length };
    })
    .filter((g) => g.items.length > 0);
}

export function useBookmarksList(opts?: { enabled?: boolean }) {
  const qc       = useQueryClient();
  const queryKey = queryKeys.collab.bookmarks;

  const query = useQuery<BookmarkListGroup[]>({
    queryKey,
    queryFn:   () =>
      clients.collab().listBookmarks().then((r) => r.groups ?? []),
    staleTime: 30_000,
    enabled:   opts?.enabled ?? true,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ entityCode, recordId }: { entityCode: string; recordId: string }) =>
      clients.collab().toggleBookmark({ entity_code: entityCode, record_id: recordId }),

    onMutate: async ({ entityCode, recordId }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<BookmarkListGroup[]>(queryKey) ?? [];
      qc.setQueryData(queryKey, removeFromGroups(previous, entityCode, recordId));
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["collab", "comment-counts"] });
    },
  });

  return {
    groups:         query.data ?? [],
    isLoading:      query.isLoading,
    error:          query.error,
    refetch:        query.refetch,
    removeBookmark: mutate,
    isRemoving:     isPending,
  };
}
