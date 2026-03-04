"use client";

/**
 * useUnreadCount hook
 *
 * Polls for unread notification count.
 * Refreshes on window focus and reconnection.
 */

import { getUnreadCount } from "@athyper/api-client";
import useSWR from "swr";

interface UseUnreadCountOptions {
  /**
   * Poll interval in milliseconds (default: 20000ms = 20s)
   */
  refreshInterval?: number;
}

export function useUnreadCount(options?: UseUnreadCountOptions) {
  const { refreshInterval = 20000 } = options ?? {};

  const { data, error, isLoading, mutate } = useSWR(
    "/api/notifications/unread-count",
    () => getUnreadCount(),
    {
      refreshInterval,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000, // Prevent duplicate requests within 5s
    },
  );

  return {
    count: data?.count ?? 0,
    isLoading,
    error,
    refresh: mutate,
  };
}
