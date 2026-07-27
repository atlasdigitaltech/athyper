"use client";

import { useQuery } from "@tanstack/react-query";

export interface InboxCountAdapter {
  /** Stable, plane-qualified cache key. */
  queryKey: readonly unknown[];
  /** Load the number represented by the plane's Inbox destination. */
  load: (signal: AbortSignal) => Promise<number>;
}

export function usePlaneInboxCount(adapter: InboxCountAdapter): number {
  const query = useQuery({
    queryKey: adapter.queryKey,
    queryFn: ({ signal }) => adapter.load(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  return normalizeCount(query.data);
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
