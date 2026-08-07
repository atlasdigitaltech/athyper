"use client";

import { bffFetch } from "@/lib/bff-fetch";
import { PLANE_KEY } from "@/lib/plane";
import {
  createNotificationsClientConfig,
  notificationEntityHref,
  type BffFetch,
  type NotificationsClientConfig,
} from "@athyper/platform-communications-notifications-client";
import { resolveRouteEntry } from "@athyper/app-neon-route-manifest";

export function createNotificationsConfig(navigate: (href: string) => void): NotificationsClientConfig {
  return createNotificationsClientConfig({
    plane: PLANE_KEY,
    fetch: bffFetch as BffFetch,
    navigate,
    resolveEntityHref: notificationEntityHref,
    isHrefAllowed: (href) => resolveRouteEntry(new URL(href, "https://neon.invalid").pathname) !== null,
  });
}
