"use client";

import { bffFetch } from "@/lib/bff-fetch";
import { PLANE_KEY } from "@/lib/plane";
import {
  createNotificationsClientConfig,
  notificationEntityHref,
  type BffFetch,
  type NotificationsClientConfig,
} from "@athyper/notifications-client";
import { resolveRouteEntry } from "@athyper/app-mesh-route-manifest";

export function createNotificationsConfig(
  navigate: (href: string) => void,
  detailEntityCodes: ReadonlySet<string>,
): NotificationsClientConfig {
  return createNotificationsClientConfig({
    plane: PLANE_KEY,
    fetch: bffFetch as BffFetch,
    navigate,
    resolveEntityHref: (notification) => {
      const entityCode = notification.entity_type?.trim().replace(/-/g, "_");
      return entityCode && detailEntityCodes.has(entityCode)
        ? notificationEntityHref({ ...notification, entity_type: entityCode })
        : undefined;
    },
    isHrefAllowed: (href) => resolveRouteEntry(new URL(href, "https://mesh.invalid").pathname) !== null,
  });
}
