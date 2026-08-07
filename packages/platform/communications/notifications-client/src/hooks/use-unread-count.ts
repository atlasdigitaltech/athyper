"use client";

import { useQuery } from "@tanstack/react-query";
import { unreadCount } from "../client/notifications-api";
import { useNotificationsConfig } from "../config";

export function useUnreadCount() {
  const config = useNotificationsConfig();
  return useQuery({
    queryKey: ["notifications", config.plane, "unread-count"],
    queryFn: () => unreadCount(config.fetch),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
