"use client";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
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
import { PanelContextRow, PanelEmptyState, PanelFooter, PanelTabs, Button, Checkbox } from "@athyper/platform-ui";
import { BellIcon } from "@athyper/platform-icons";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
/** Channel names come from activity.preferences.<key> (en, ms, ar). */
const channels: readonly { code: NotificationChannel; key: string }[] = [
  { code: "in_app", key: "inApp" },
  { code: "email", key: "email" },
  { code: "push", key: "push" },
  { code: "sms", key: "sms" },
  { code: "whatsapp", key: "whatsapp" },
];
function usePreferenceText() {
  const intl = useEntityI18n();
  return (key: string, values?: Record<string, string | number>) => intl.message(`activity.preferences.${key}`, values);
}
const eventCode = "collaboration.comment.mentioned";
/** The body of the Notification preferences side panel: the shared panel anatomy
 * (context row, section tabs, one scrolling body, footer pinned at the bottom). */
export function NotificationControls({
  deviceSettings,
}: {
  /** Settings for this browser or device, such as browser alerts. */
  readonly deviceSettings?: ReactNode;
} = {}) {
  const canInspect = usePermission("notifications.delivery.read");
  const text = usePreferenceText();
  const id = useId();
  const [tab, setTab] = useState<"preferences" | "deliveries">("preferences");
  const [dirty, setDirty] = useState(false);
  const shown = canInspect ? tab : "preferences";
  return (
    <div className="athyper-notification-controls">
      <PanelContextRow
        scope={{ kind: "global", label: text("account"), detail: shown === "preferences" && dirty ? text("unsaved") : undefined }}
      />
      {canInspect ? (
        <PanelTabs
          label={text("tabs")}
          value={shown}
          onValueChange={(key) => setTab(key as typeof tab)}
          items={[
            { key: "preferences", label: text("tabPreferences"), id: `${id}-preferences-tab`, panelId: `${id}-preferences` },
            { key: "deliveries", label: text("deliveryStatus"), id: `${id}-deliveries-tab`, panelId: `${id}-deliveries` },
          ]}
        />
      ) : null}
      {shown === "preferences" ? (
        <Preferences
          deviceSettings={deviceSettings}
          onDirtyChange={setDirty}
          panel={canInspect ? { id: `${id}-preferences`, labelledBy: `${id}-preferences-tab` } : undefined}
        />
      ) : (
        <Deliveries panel={{ id: `${id}-deliveries`, labelledBy: `${id}-deliveries-tab` }} />
      )}
    </div>
  );
}
type TabPanel = { readonly id: string; readonly labelledBy: string } | undefined;
const tabPanelProps = (panel: TabPanel) =>
  panel ? { id: panel.id, role: "tabpanel" as const, "aria-labelledby": panel.labelledBy } : {};
function Preferences({
  deviceSettings,
  onDirtyChange,
  panel,
}: {
  readonly deviceSettings?: ReactNode;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly panel: TabPanel;
}) {
  const text = usePreferenceText();
  const rowId = useId();
  const label = (code: NotificationChannel) => text(channels.find((channel) => channel.code === code)?.key ?? code);
  const client = useApiClient(),
    notifications = useMemo(() => createNotificationClient(client), [client]);
  const [snapshot, setSnapshot] = useState<NotificationPreferenceSnapshot>(),
    [selected, setSelected] = useState<readonly NotificationChannel[]>([]),
    [error, setError] = useState<string>(),
    [loadFailed, setLoadFailed] = useState(false),
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
    Boolean(snapshot) &&
    JSON.stringify([...selected].sort()) !==
      JSON.stringify([...savedChannels].sort());
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
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
        setLoadFailed(false);
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
        if (c.signal.aborted) return;
        setError(text("loadFailed"));
        setLoadFailed(true);
      });
    return () => c.abort();
  }, [notifications, revision]);
  const reload = () => {
    setSnapshot(undefined);
    setStatus(undefined);
    setError(undefined);
    setRevision((v) => v + 1);
  };
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
          text("blocked", { channels: blocked.map((c) => label(c.channel)).join(", ") }),
        );
        return;
      }
      setSnapshot(
        await notifications.updatePreferences(preferences, snapshot.version),
      );
      setStatus(text("saved"));
    } catch {
      setError(text("saveFailed"));
    } finally {
      setBusy(false);
    }
  }
  /** One plain-language status per channel, from the server's preview. */
  const channelStatus = (code: NotificationChannel): { readonly text: string; readonly tone?: "warning" } | undefined => {
    const value = availability.find((item) => item.channel === code);
    if (!value) return undefined;
    if (value.reason === "enabled") return { text: text("channelAvailable") };
    if (savedChannels.includes(code)) return { text: text("channelSavedUnavailable"), tone: "warning" };
    if (value.reason === "consent_required")
      return { text: text(code === "push" ? "channelPushConsent" : "channelConsent") };
    return { text: text("channelUnsupported") };
  };
  return (
    <>
      <div className="athyper-notification-controls__body" {...tabPanelProps(panel)}>
        <section className="athyper-notification-controls__device" aria-label={text("thisBrowser")}>
          <h3>{text("thisBrowser")}</h3>
          {deviceSettings}
        </section>
        <section aria-label={text("mentionRegion")}>
          <h3>{text("mentionTitle")}</h3>
          <p>{text("mentionHint")}</p>
          {snapshot ? (
            <fieldset disabled={busy}>
              <legend className="a-visually-hidden">{text("channels")}</legend>
              {channels.map((c) => {
                const unavailable =
                  !selected.includes(c.code) &&
                  availability.some((value) => value.channel === c.code && !value.enabled);
                const state = channelStatus(c.code);
                const statusId = `${rowId}-${c.code}`;
                return (
                  <div key={c.code} className="athyper-notification-controls__channel" data-unavailable={unavailable || undefined}>
                  <label>
                    <Checkbox
                      aria-describedby={state ? statusId : undefined}
                      disabled={unavailable}
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
                    <span>{label(c.code)}</span>
                  </label>
                    {state ? <small id={statusId} data-tone={state.tone}>{state.text}</small> : null}
                  </div>
                );
              })}
            </fieldset>
          ) : !error ? (
            <p role="status">{text("loading")}</p>
          ) : null}
          {loadFailed ? (
            <div className="athyper-notification-controls__error" role="alert">
              <span>{error}</span>
              <Button size="small" variant="secondary" onClick={reload}>
                {text("tryAgain")}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
      {snapshot ? (
        <PanelFooter className="athyper-notification-controls__footer">
          {error && !loadFailed ? <p role="alert">{error}</p> : status ? <p role="status">{status}</p> : null}
          <div>
            <Button variant="ghost" disabled={busy || !dirty} onClick={reload}>
              {text("discard")}
            </Button>
            <Button variant="primary" disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? text("saving") : text("save")}
            </Button>
          </div>
        </PanelFooter>
      ) : null}
    </>
  );
}
function Deliveries({ panel }: { readonly panel: TabPanel }) {
  const text = usePreferenceText();
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
        if (!c.signal.aborted) setError(text("deliveriesFailed"));
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
      setError(text("retryRejected"));
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
      setError(text("moreFailed"));
    } finally {
      setBusy(undefined);
    }
  }
  const when = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const statusLabel = (value: string) =>
    ["delivered", "sent", "pending", "queued", "failed", "bounced"].includes(value)
      ? text(`status.${value}`)
      : value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
  const tone = (value: string) =>
    value === "failed" || value === "bounced" ? "attention" : value === "delivered" || value === "sent" ? "done" : "progress";
  const channelName = (code: string) => text(channels.find((channel) => channel.code === code)?.key ?? code);
  return (
    <div className="athyper-notification-controls__body" aria-label={text("deliveryRegion")} {...tabPanelProps(panel)}>
      <div className="athyper-notification-controls__toolbar">
        <Button
          size="small"
          variant="secondary"
          disabled={loading || !!busy}
          onClick={() => setRevision((v) => v + 1)}
        >
          {text("refresh")}
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? (
        <p role="status">{text("loadingDeliveries")}</p>
      ) : items.length ? (
        <ul className="athyper-notification-controls__deliveries">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.subject ?? text("notification")}</strong>
                <time dateTime={item.createdAt}>{when(item.createdAt)}</time>
              </div>
              <p>
                <span className="athyper-notification-controls__pill" data-tone={tone(item.status)}>
                  {statusLabel(item.status)}
                </span>
                <span>{channelName(item.channel)}</span>
                <span>{text("attempts", { count: item.attemptCount })}</span>
              </p>
              {item.error ? <p className="athyper-notification-controls__delivery-error">{item.error}</p> : null}
              {canRetry && ["failed", "bounced"].includes(item.status) ? (
                <Button
                  size="small"
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() => void retry(item.id)}
                >
                  {busy === item.id ? text("retrying") : text("retry")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !error ? (
        <PanelEmptyState
          icon={<BellIcon />}
          title={text("emptyTitle")}
          description={text("emptyDetail")}
        />
      ) : null}
      {cursor ? (
        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() => void more()}
        >
          {text("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
