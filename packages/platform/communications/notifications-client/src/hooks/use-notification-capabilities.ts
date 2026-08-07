"use client";

import { useQuery } from "@tanstack/react-query";
import { getNotificationCapabilities } from "../client/push-api";
import { useNotificationsConfig } from "../config";

export function useNotificationCapabilities() {
  const config = useNotificationsConfig();
  return useQuery({
    queryKey: ["notifications", config.plane, "capabilities"],
    queryFn: () => getNotificationCapabilities(config.fetch),
    staleTime: 60_000,
  });
}
