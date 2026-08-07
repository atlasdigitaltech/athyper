import { NotificationSchema, type Notification } from "@athyper/api-contracts";
import type { BffFetch } from "../config";

export interface NotificationListResponse {
  data: Notification[];
  hasMore: boolean;
}

export async function listNotifications(fetcher: BffFetch, options?: { unread?: boolean; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (options?.unread) query.set("unread", "true");
  if (options?.limit) query.set("limit", String(options.limit));
  if (options?.offset) query.set("offset", String(options.offset));
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await fetcher<NotificationListResponse>(`/api/relay/platform/notifications${suffix}`);
  return {
    data: response.data.map((item) => NotificationSchema.parse(item)),
    hasMore: Boolean(response.hasMore),
  };
}

export function unreadCount(fetcher: BffFetch) {
  return fetcher<{ count: number }>("/api/relay/platform/notifications/unread-count");
}

export function markNotificationRead(fetcher: BffFetch, deliveryId: string) {
  return fetcher(`/api/relay/platform/notifications/${encodeURIComponent(deliveryId)}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead(fetcher: BffFetch) {
  return fetcher("/api/relay/platform/notifications/read-all", { method: "POST" });
}
