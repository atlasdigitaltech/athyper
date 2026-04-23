/**
 * useRecordBookmarks — batch bookmark state for a page of entity records.
 *
 * Fetches bookmark membership for all visible row IDs in one request.
 * Provides an optimistic toggle mutation that updates the local cache
 * before the server confirms.
 *
 * Called once at page level in EntityListPage — never per-row.
 * Max 100 IDs per batch; splits automatically when page is larger.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}

const MAX_BATCH = 100;

async function fetchBookmarkedIds(
  entityCode: string,
  recordIds: string[],
): Promise<string[]> {
  if (recordIds.length === 0) return [];

  // Split into ≤100-ID batches and fetch in parallel
  const batches: string[][] = [];
  for (let i = 0; i < recordIds.length; i += MAX_BATCH) {
    batches.push(recordIds.slice(i, i + MAX_BATCH));
  }

  const results = await Promise.all(
    batches.map((ids) =>
      fetch(
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
): Promise<{ bookmarked: boolean }> {
  const res = await fetch("/api/collab/bookmarks", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": getCsrfToken(),
    },
    body:    JSON.stringify({ entity_code: entityCode, record_id: recordId }),
  });
  if (!res.ok) throw new Error("Bookmark toggle failed");
  return res.json() as Promise<{ bookmarked: boolean }>;
}

export function useRecordBookmarks(entityCode: string, recordIds: string[]) {
  const qc         = useQueryClient();
  const stableIds  = recordIds.slice().sort().join(",");
  const queryKey   = ["record-bookmarks", entityCode, stableIds];

  const { data = [], isLoading } = useQuery<string[]>({
    queryKey,
    queryFn:   () => fetchBookmarkedIds(entityCode, recordIds),
    staleTime: 60_000,
    enabled:   recordIds.length > 0,
  });

  const bookmarkedIds = new Set(data);

  const { mutate, isPending } = useMutation({
    mutationFn: ({ recordId }: { recordId: string }) =>
      toggleBookmarkRequest(entityCode, recordId),

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
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const toggle = useCallback(
    (recordId: string) => mutate({ recordId }),
    [mutate],
  );

  return { bookmarkedIds, toggle, isLoading, isPending };
}
