"use client";
import { useEffect, useMemo, useState } from "react";
import {
  useApiClient,
  usePermission,
} from "@athyper/platform-shell-app-foundation";
import {
  createNotificationClient,
  notificationDeliveriesOperation,
  notificationDeliveryReplayOperation,
  type NotificationChannel,
  type NotificationPreferenceSnapshot,
  type NotificationDeliverySummary,
  type NotificationPreferencePreview,
} from "@athyper/platform-communications-notifications-client";
import { PanelEmptyState, Button, Checkbox } from "@athyper/platform-ui";
import { BellIcon } from "@athyper/platform-icons";
const channels: readonly { code: NotificationChannel; label: string }[] = [
  { code: "in_app", label: "In-app" },
  { code: "email", label: "Email" },
  { code: "push", label: "Browser / device push" },
  { code: "sms", label: "SMS" },
  { code: "whatsapp", label: "WhatsApp" },
];
const eventCode = "collaboration.comment.mentioned";
export function NotificationControls({
  expanded = false,
}: { readonly expanded?: boolean } = {}) {
  const canInspect = usePermission("notifications.delivery.read");
  return (
    <div className="athyper-notification-controls">
      <details open={expanded || undefined}>
        <summary>Notification preferences</summary>
        <Preferences />
      </details>
      {canInspect ? (
        <details>
          <summary>Delivery status</summary>
          <Deliveries />
        </details>
      ) : null}
    </div>
  );
}
function Preferences() {
  const client = useApiClient(),
    notifications = useMemo(() => createNotificationClient(client), [client]);
  const [snapshot, setSnapshot] = useState<NotificationPreferenceSnapshot>(),
    [selected, setSelected] = useState<readonly NotificationChannel[]>([]),
    [error, setError] = useState<string>(),
    [status, setStatus] = useState<string>(),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [availability, setAvailability] = useState<
    NotificationPreferencePreview["channels"]
  >([]);
  const savedChannels = snapshot?.preferences.find(
    (p) => p.eventCode === eventCode,
  )?.channels ?? ["in_app", "email"];
  const dirty =
    JSON.stringify([...selected].sort()) !==
    JSON.stringify([...savedChannels].sort());
  useEffect(() => {
    const c = new AbortController();
    notifications
      .preferences(c.signal)
      .then((s) => {
        if (c.signal.aborted) return;
        setSnapshot(s);
        setSelected(
          s.preferences.find((p) => p.eventCode === eventCode)?.channels ?? [
            "in_app",
            "email",
          ],
        );
        setError(undefined);
        return notifications
          .previewPreferences(
            [{ eventCode, channels: channels.map((channel) => channel.code) }],
            c.signal,
          )
          .then((previews) => {
            if (!c.signal.aborted) setAvailability(previews[0]?.channels ?? []);
          });
      })
      .catch(() => {
        if (!c.signal.aborted) setError("Preferences could not be loaded.");
      });
    return () => c.abort();
  }, [notifications, revision]);
  async function save() {
    if (!snapshot) return;
    setBusy(true);
    setError(undefined);
    setStatus(undefined);
    try {
      const preferences = [
        ...snapshot.preferences
          .filter((p) => p.eventCode !== eventCode)
          .map(({ eventCode, channels }) => ({ eventCode, channels })),
        { eventCode, channels: selected },
      ];
      const previews = await notifications.previewPreferences([
        { eventCode, channels: selected },
      ]);
      const blocked = previews.flatMap((p) =>
        p.channels.filter((c) => !c.enabled),
      );
      if (blocked.length) {
        setError(
          `Unavailable or awaiting consent: ${blocked.map((c) => channels.find((x) => x.code === c.channel)?.label).join(", ")}. Deselect these channels to save.`,
        );
        return;
      }
      setSnapshot(
        await notifications.updatePreferences(preferences, snapshot.version),
      );
      setStatus("Preferences saved.");
    } catch {
      setError(
        "Preferences could not be saved. Reload to pick up any changes and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Mention notification preferences">
      <h3>When someone mentions you</h3>
      <p>
        Choose how you hear about mentions. Some channels may need setup or your
        permission.
      </p>
      {snapshot ? (
        <fieldset disabled={busy}>
          <legend>Channels</legend>
          {channels.map((c) => (
            <label key={c.code}>
              <Checkbox
                disabled={
                  !selected.includes(c.code) &&
                  availability.some(
                    (value) => value.channel === c.code && !value.supported,
                  )
                }
                checked={selected.includes(c.code)}
                onChange={(e) => {
                  setStatus(undefined);
                  setSelected(
                    e.target.checked
                      ? [...selected, c.code]
                      : selected.filter((v) => v !== c.code),
                  );
                }}
              />
              {c.label}
              {availability.find((value) => value.channel === c.code)
                ?.reason === "unsupported" ? (
                <small>Not available</small>
              ) : availability.find((value) => value.channel === c.code)
                  ?.reason === "consent_required" ? (
                <small>Permission needed</small>
              ) : null}
            </label>
          ))}
        </fieldset>
      ) : !error ? (
        <p role="status">Loading preferences…</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {status ? <p role="status">{status}</p> : null}
      <div className="athyper-notification-controls__actions">
        <Button
          variant="secondary"
          disabled={!snapshot || busy || !dirty}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save preferences"}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setSnapshot(undefined);
            setRevision((v) => v + 1);
          }}
        >
          Reload
        </Button>
      </div>
    </section>
  );
}
function Deliveries() {
  const client = useApiClient(),
    canRetry = usePermission("notifications.delivery.replay");
  const [items, setItems] = useState<readonly NotificationDeliverySummary[]>(
      [],
    ),
    [cursor, setCursor] = useState<string>(),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState<string>();
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    client
      .request(notificationDeliveriesOperation, { signal: c.signal })
      .then((page) => {
        if (c.signal.aborted) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(undefined);
      })
      .catch(() => {
        if (!c.signal.aborted) setError("Delivery status could not be loaded.");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [client, revision]);
  async function retry(id: string) {
    setBusy(id);
    setError(undefined);
    try {
      const key = crypto.randomUUID();
      await client.request(notificationDeliveryReplayOperation, {
        params: { id },
        body: { replayKey: key },
        idempotencyKey: key,
      });
      setRevision((v) => v + 1);
    } catch {
      setError(
        "Retry was not accepted. Refresh to check the current delivery status.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  async function more() {
    if (!cursor) return;
    setBusy("more");
    try {
      const page = await client.request(notificationDeliveriesOperation, {
        query: { before: cursor },
      });
      setItems((current) => [
        ...current,
        ...page.items.filter((i) => !current.some((x) => x.id === i.id)),
      ]);
      setCursor(page.nextCursor);
    } catch {
      setError("More deliveries could not be loaded.");
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <section aria-label="Notification delivery status">
      <div className="athyper-notification-controls__actions">
        <h3>Delivery status</h3>
        <Button
          variant="secondary"
          disabled={loading || !!busy}
          onClick={() => setRevision((v) => v + 1)}
        >
          Refresh
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? (
        <p role="status">Loading deliveries…</p>
      ) : items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.subject ?? "Notification"}</strong>
              <span>
                {item.channel} · {item.status} · {item.attemptCount} attempts
              </span>
              {item.error ? <p>{item.error}</p> : null}
              {canRetry && ["failed", "bounced"].includes(item.status) ? (
                <Button
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() => void retry(item.id)}
                >
                  {busy === item.id ? "Retrying…" : "Retry delivery"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !error ? (
        <PanelEmptyState
          icon={<BellIcon />}
          title="No deliveries yet"
          description="Notification deliveries will appear here after an eligible event."
        />
      ) : null}
      {cursor ? (
        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() => void more()}
        >
          Load more
        </Button>
      ) : null}
    </section>
  );
}
