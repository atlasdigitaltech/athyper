"use client";

/**
 * useReadTracking - Mark comments as read and track unread count.
 */

import { useCallback } from "react";
import useSWR from "swr";

import { collabFetcher, collabMutate } from "./fetcher";

interface UnreadCountResponse {
  ok: boolean;
  count: number;
}

export function useReadTracking(entityType?: string, entityId?: string) {
  const params = new URLSearchParams();
  if (entityType) params.set("entityType", entityType);
  if (entityId) params.set("entityId", entityId);

  const key =
    entityType && entityId
      ? `/api/collab/comments/unread-count?${params}`
      : null;

  const { data, mutate } = useSWR<UnreadCountResponse>(
    key,
    collabFetcher,
    { refreshInterval: 30_000 }, // Poll every 30s
  );

  const markAsRead = useCallback(
    async (commentId: string) => {
      await collabMutate(`/api/collab/comments/${commentId}/read`, "POST");
      await mutate();
    },
    [mutate],
  );

  const markAllAsRead = useCallback(async () => {
    if (!entityType || !entityId) return;

    const p = new URLSearchParams({ entityType, entityId });
    await collabMutate(`/api/collab/comments/mark-all-read?${p}`, "POST");
    await mutate();
  }, [entityType, entityId, mutate]);

  return {
    unreadCount: data?.count ?? 0,
    markAsRead,
    markAllAsRead,
  };
}
