"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotificationPreferences,
  patchNotificationPreferences,
  type NotificationPreferencePatch,
} from "../client/preferences-api";
import { useNotificationsConfig } from "../config";

export function useNotificationPreferences() {
  const config = useNotificationsConfig();
  return useQuery({
    queryKey: ["notifications", config.plane, "preferences"],
    queryFn: () => getNotificationPreferences(config.fetch),
    staleTime: 30_000,
  });
}

export function useSaveNotificationPreferences() {
  const config = useNotificationsConfig();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preferences: NotificationPreferencePatch[]) =>
      patchNotificationPreferences(config.fetch, preferences),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications", config.plane, "preferences"] }),
  });
}
