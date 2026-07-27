"use client";

import { bffFetch } from "@/lib/bff-fetch";
import { PLANE_KEY } from "@/lib/plane";
import {
  createNotificationsClientConfig,
  type BffFetch,
  type NotificationsClientConfig,
} from "@athyper/notifications-client";
import { resolveRouteEntry } from "@athyper/app-admin-route-manifest";

export function createNotificationsConfig(navigate: (href: string) => void): NotificationsClientConfig {
  return createNotificationsClientConfig({
    plane: PLANE_KEY,
    fetch: bffFetch as BffFetch,
    navigate,
    isHrefAllowed: (href) => resolveRouteEntry(new URL(href, "https://admin.invalid").pathname) !== null,
  });
}
