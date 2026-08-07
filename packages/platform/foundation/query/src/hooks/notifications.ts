"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";

export function useNotifications(params?: Record<string, string>) {
  const queryKey = params
    ? [...queryKeys.notifications.all, params]
    : queryKeys.notifications.all;

  return useQuery({
    queryKey,
    queryFn:   () => clients.platform().getNotifications(params),
    staleTime: 30 * 1000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey:        queryKeys.notifications.unreadCount,
    queryFn:         () => clients.platform().getUnreadCount(),
    staleTime:       30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
