import { NotificationPreferenceSchema } from "@athyper/api-contracts";
import type { BffFetch } from "../config";

export interface NotificationPreference {
  id: string;
  event_code: string;
  channel: string;
  is_enabled: boolean | null;
  frequency_code: string | null;
  status?: string;
}

export type NotificationPreferencePatch = Omit<NotificationPreference, "id" | "status">;

export async function getNotificationPreferences(fetcher: BffFetch) {
  const response = await fetcher<{ data: NotificationPreference[] }>(
    "/api/relay/api/notifications/preferences",
  );
  return { data: response.data.map((item) => NotificationPreferenceSchema.parse(item)) };
}

export function patchNotificationPreferences(
  fetcher: BffFetch,
  preferences: NotificationPreferencePatch[],
) {
  return fetcher("/api/relay/api/notifications/preferences", {
    method: "PATCH",
    body: { preferences },
  });
}
