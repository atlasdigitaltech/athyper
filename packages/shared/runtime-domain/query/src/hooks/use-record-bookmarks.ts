/**
 * useRecordBookmarks — batch bookmark state for a page of entity records.
 *
 * Fetches bookmark membership for all visible row IDs in one request.
 * Provides an optimistic toggle mutation that updates the local cache
 * before the server confirms.
 *
 * Called once at runtime-list page level — never per-row.
 * Max 100 IDs per batch; splits automatically when page is larger.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { csrfFetch } from "@athyper/runtime-shared/client";

const MAX_BATCH = 100;

export type BookmarkRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface BookmarkSnapshot {
  displayName?: string | null;
}

export interface BookmarkListItem {
  id: string;
  entityCode: string;
  recordId: string;
  displayName: string | null;
  recordCode: string | null;
  createdAt: string;
}

export interface BookmarkListGroup {
  entityCode: string;
  count: number;
  items: BookmarkListItem[];
}

interface BookmarkListResponse {
  ok?: boolean;
  groups?: BookmarkListGroup[];
}

async function fetchBookmarkedIds(
  entityCode: string,
  recordIds: string[],
  request: BookmarkRequest,
): Promise<string[]> {
  if (recordIds.length === 0) return [];

  // Split into ≤100-ID batches and fetch in parallel
  const batches: string[][] = [];
  for (let i = 0; i < recordIds.length; i += MAX_BATCH) {
    batches.push(recordIds.slice(i, i + MAX_BATCH));
  }

  const results = await Promise.all(
    batches.map((ids) =>
      request(
        `/api/collab/bookmarks/batch?entity_code=${encodeURIComponent(entityCode)}&ids=${ids.join(",")}`,
        { cache: "no-store" },
      )
        .then((r) => r.json() as Promise<{ bookmarked_ids?: string[] }>)
        .then((d) => d.bookmarked_ids ?? [])
        .catch(() => [] as string[]),
    ),
  );

  return results.flat();
}

async function toggleBookmarkRequest(
  entityCode: string,
  recordId: string,
  snapshot?: BookmarkSnapshot,
  request: BookmarkRequest = csrfFetch,
): Promise<{ bookmarked: boolean }> {
  const res = await request("/api/collab/bookmarks", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body:    JSON.stringify({
      entity_code:  entityCode,
      record_id:    recordId,
      label_snapshot: snapshot?.displayName ?? undefined,
    }),
  });
  if (!res.ok) throw new Error("Bookmark toggle failed");
  return res.json() as Promise<{ bookmarked: boolean }>;
}

async function fetchBookmarksList(request: BookmarkRequest, signal?: AbortSignal): Promise<BookmarkListGroup[]> {
  const res = await request("/api/collab/bookmarks", { cache: "no-store", signal });
  if (!res.ok) throw new Error("Bookmark list failed");
  const data = await res.json() as BookmarkListResponse;
  return data.groups ?? [];
}

function removeFromGroups(
  groups: BookmarkListGroup[],
  entityCode: string,
  recordId: string,
): BookmarkListGroup[] {
  return groups
    .map((group) => {
      if (group.entityCode !== entityCode) return group;
      const items = group.items.filter((item) => item.recordId !== recordId);
      return { ...group, items, count: items.length };
    })
    .filter((group) => group.items.length > 0);
}

export function useRecordBookmarks(
  entityCode: string,
  recordIds: string[],
  options?: { request?: BookmarkRequest },
) {
  const qc         = useQueryClient();
  const stableIds  = recordIds.slice().sort().join(",");
  const queryKey   = ["record-bookmarks", entityCode, stableIds];

  const { data = [], isLoading } = useQuery<string[]>({
    queryKey,
    queryFn:   () => fetchBookmarkedIds(entityCode, recordIds, options?.request ?? fetch),
    staleTime: 60_000,
    enabled:   recordIds.length > 0,
  });

  const bookmarkedIds = new Set(data);

  const { mutate, isPending } = useMutation({
    mutationFn: ({ recordId, snapshot }: { recordId: string; snapshot?: BookmarkSnapshot }) =>
      toggleBookmarkRequest(entityCode, recordId, snapshot, options?.request ?? csrfFetch),

    // Optimistic update — flip the local set immediately
    onMutate: async ({ recordId }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<string[]>(queryKey) ?? [];
      const next = bookmarkedIds.has(recordId)
        ? previous.filter((id) => id !== recordId)
        : [...previous, recordId];
      qc.setQueryData(queryKey, next);
      return { previous };
    },

    // Roll back on server error
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
    },

    // Revalidate to sync with server truth
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: queryKeys.collab.bookmarks });
    },
  });

  const toggle = useCallback(
    (recordId: string, snapshot?: BookmarkSnapshot) => mutate({ recordId, snapshot }),
    [mutate],
  );

  return { bookmarkedIds, toggle, isLoading, isPending };
}

export function useBookmarksList(options?: {
  enabled?: boolean;
  request?: BookmarkRequest;
}) {
  const qc = useQueryClient();
  const queryKey = queryKeys.collab.bookmarks;

  const query = useQuery<BookmarkListGroup[]>({
    queryKey,
    queryFn:   ({ signal }) => fetchBookmarksList(options?.request ?? fetch, signal),
    staleTime: 30_000,
    enabled:   options?.enabled ?? true,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ entityCode, recordId }: { entityCode: string; recordId: string }) =>
      toggleBookmarkRequest(entityCode, recordId, undefined, options?.request ?? csrfFetch),

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
      qc.invalidateQueries({ queryKey: ["record-bookmarks"] });
    },
  });

  return {
    groups: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    removeBookmark: mutate,
    isRemoving: isPending,
  };
}
