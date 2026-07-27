"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../client/notifications-api";
import { useNotificationsConfig } from "../config";

export function useNotifications(options?: { unread?: boolean; limit?: number; offset?: number }) {
  const config = useNotificationsConfig();
  return useQuery({
    queryKey: ["notifications", config.plane, options ?? {}],
    queryFn: () => listNotifications(config.fetch, options),
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const config = useNotificationsConfig();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => markNotificationRead(config.fetch, deliveryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", config.plane] }),
  });
}

export function useMarkAllNotificationsRead() {
  const config = useNotificationsConfig();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(config.fetch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", config.plane] }),
  });
}
