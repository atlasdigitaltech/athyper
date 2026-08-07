"use client";

import { useMemo, useState } from "react";
import type { NotificationPreferencePatch } from "../client/preferences-api";
import { useNotificationCapabilities } from "../hooks/use-notification-capabilities";
import {
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from "../hooks/use-notification-preferences";
import { usePushSubscription } from "../hooks/use-push-subscription";

export function NotificationsSettingsSection() {
  const preferences = useNotificationPreferences();
  const capabilities = useNotificationCapabilities();
  const save = useSaveNotificationPreferences();
  const push = usePushSubscription();
  const [drafts, setDrafts] = useState<Map<string, NotificationPreferencePatch>>(new Map());

  const availableChannels = useMemo(
    () => new Set(
      (capabilities.data?.data.channels ?? [])
        .filter((channel) => channel.available)
        .map((channel) => channel.code),
    ),
    [capabilities.data],
  );
  const rows = (preferences.data?.data ?? []).filter((row) => availableChannels.has(row.channel));
  const pushAvailable = availableChannels.has("push");
  const availableFrequencies = (capabilities.data?.data.digest_frequencies ?? [])
    .filter((frequency) => frequency.available)
    .map((frequency) => frequency.code);

  if (preferences.isLoading || capabilities.isLoading) {
    return <div className="py-6 text-sm text-muted-foreground">Loading notification settings…</div>;
  }

  return (
    <section className="space-y-4" aria-label="Notification settings">
      <div>
        <h2 className="text-base font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Preferences are isolated to this application plane.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No configurable notification preferences are available.
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((row) => {
            const key = `${row.event_code}:${row.channel}`;
            const draft = drafts.get(key);
            const checked = draft?.is_enabled ?? row.is_enabled ?? true;
            const frequency = draft?.frequency_code ?? row.frequency_code ?? "immediate";
            return (
              <div key={row.id} className="flex items-center justify-between gap-4 p-3">
                <span>
                  <span className="block text-sm font-medium">{row.event_code}</span>
                  <span className="block text-xs text-muted-foreground">{row.channel}</span>
                </span>
                <span className="flex items-center gap-3">
                  {availableFrequencies.length > 1 && (
                    <select
                      aria-label={`${row.event_code} delivery frequency`}
                      value={frequency}
                      onChange={(event) => {
                        const next: NotificationPreferencePatch = {
                          event_code: row.event_code,
                          channel: row.channel,
                          is_enabled: checked,
                          frequency_code: event.target.value,
                        };
                        setDrafts((current) => new Map(current).set(key, next));
                      }}
                    >
                      {availableFrequencies.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  )}
                  <input
                    aria-label={`${row.event_code} ${row.channel}`}
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next: NotificationPreferencePatch = {
                        event_code: row.event_code,
                        channel: row.channel,
                        is_enabled: event.target.checked,
                        frequency_code: frequency,
                      };
                      setDrafts((current) => new Map(current).set(key, next));
                    }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={drafts.size === 0 || save.isPending}
        onClick={() => save.mutate([...drafts.values()], { onSuccess: () => setDrafts(new Map()) })}
      >
        Save notification preferences
      </button>

      {pushAvailable && (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <span className="text-sm">
            Browser push: {push.status === "subscribed" ? "enabled" : "disabled"}
          </span>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            disabled={push.status === "requesting" || push.status === "unsubscribing"}
            onClick={() => {
              if (push.status === "subscribed") void push.unsubscribe();
              else void push.subscribe();
            }}
          >
            {push.status === "subscribed" ? "Disable" : "Enable"}
          </button>
        </div>
      )}
    </section>
  );
}
