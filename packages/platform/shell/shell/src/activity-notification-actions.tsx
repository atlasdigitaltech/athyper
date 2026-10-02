"use client";
import { useState } from "react";
import { BellIcon, CheckIcon } from "@athyper/platform-icons";
import { Button } from "@athyper/platform-ui";
import { activityCount } from "./activity-counts";
import type { ShellActivityDataSource } from "./activity-center";
import { useShellI18n } from "./shell-i18n";

async function attempt(
  action: () => void | Promise<void>,
  setBusy: (busy: boolean) => void,
  setError: (error?: string) => void,
  failure: string,
) {
  setBusy(true);
  setError(undefined);
  try {
    await action();
  } catch {
    setError(failure);
  } finally {
    setBusy(false);
  }
}

/** The one list action for notifications, in the panel and the full page.
 * Settings such as browser alerts live in Notification preferences. */
export function ActivityNotificationActions({ data }: { data: ShellActivityDataSource }) {
  const intl = useShellI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  if (!data.onMarkAllNotificationsRead) return null;
  return (
    <div className="athyper-activity-query__actions">
      <Button
        size="small"
        variant="ghost"
        disabled={busy || data.loading || !(activityCount(data, "notifications")! > 0)}
        title={intl.message("activity.markAllReadHint")}
        onClick={() =>
          void attempt(() => data.onMarkAllNotificationsRead!(), setBusy, setError, intl.message("activity.updateManyFailed"))
        }
      >
        <CheckIcon size={16} />
        {intl.message("activity.markAllRead")}
      </Button>
      {error ? <span role="alert" className="athyper-activity-query__action-error">{error}</span> : null}
    </div>
  );
}

/** Browser alerts for this device: a notification setting, shown in
 * Notification preferences rather than beside the list. */
export function BrowserAlertsSetting({ data }: { data: ShellActivityDataSource }) {
  const intl = useShellI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const status = data.pushEnrollmentStatus;
  if (!status || status === "checking" || status === "unsupported" || status === "unavailable") return null;
  return (
    <div className="athyper-browser-alerts">
      <div>
        <strong>{intl.message("activity.browserAlerts")}</strong>
        <span>
          {intl.message(
            status === "enabled"
              ? "activity.browserAlerts.on"
              : status === "denied"
                ? "activity.browserAlerts.blocked"
                : "activity.browserAlerts.off",
          )}
        </span>
      </div>
      {status === "enabled" || status === "prompt" || status === "error" ? (
        <Button
          size="small"
          variant="secondary"
          disabled={busy}
          aria-pressed={status === "enabled"}
          title={data.pushEnrollmentError}
          onClick={() =>
            void attempt(
              () => (status === "enabled" ? data.onDisableBrowserPush?.() : data.onEnableBrowserPush?.()),
              setBusy,
              setError,
              intl.message("activity.updateManyFailed"),
            )
          }
        >
          <BellIcon size={16} />
          {intl.message(status === "enabled" ? "activity.turnOff" : "activity.turnOn")}
        </Button>
      ) : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
