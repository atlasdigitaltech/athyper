import {
  NotificationCapabilitiesSchema,
  type NotificationCapabilities,
} from "@athyper/api-contracts";
import type { BffFetch } from "../config";

export async function getNotificationCapabilities(fetcher: BffFetch) {
  const response = await fetcher<{ data: NotificationCapabilities }>(
    "/api/relay/api/notifications/capabilities",
  );
  return { data: NotificationCapabilitiesSchema.parse(response.data) };
}

export function getVapidKey(fetcher: BffFetch) {
  return fetcher<{ data: { public_key: string; configured: boolean } }>(
    "/api/relay/api/notifications/push/vapid-key",
  );
}

export function registerPushSubscription(fetcher: BffFetch, body: Record<string, unknown>) {
  return fetcher<{ data: { id?: string } }>("/api/relay/api/notifications/push/subscribe", {
    method: "POST",
    body,
  });
}

export function unregisterPushSubscription(fetcher: BffFetch, id: string) {
  return fetcher(`/api/relay/api/notifications/push/subscribe/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
