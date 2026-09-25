"use client";
import { useState } from "react";
import { BellIcon, CheckIcon } from "@athyper/platform-icons";
import { Button } from "@athyper/platform-ui";
import { activityCount } from "./activity-counts";
import type { ShellActivityDataSource } from "./activity-center";

/** Shared notification actions for the full page and compact drawer. */
export function ActivityNotificationActions({ data }: { data: ShellActivityDataSource }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const status = data.pushEnrollmentStatus;
  async function run(action: () => void | Promise<void>) {
    setBusy(true); setError(undefined);
    try { await action(); } catch { setError("Could not update notifications. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="athyper-activity-query__actions">
    {status === "enabled" || status === "prompt" || status === "error" ? <Button size="small" variant="ghost" disabled={busy} aria-pressed={status === "enabled"} title={data.pushEnrollmentError} onClick={() => void run(() => status === "enabled" ? data.onDisableBrowserPush?.() : data.onEnableBrowserPush?.())}>
      <BellIcon size={16} />{status === "enabled" ? "Browser alerts: On" : "Enable browser alerts"}
    </Button> : status === "denied" ? <span className="athyper-activity-query__push-status" title="Allow notifications in your browser site settings"><BellIcon size={16} />Browser alerts blocked</span> : null}
    {data.onMarkAllNotificationsRead ? <Button size="small" variant="ghost" disabled={busy || data.loading || !(activityCount(data, "notifications")! > 0)} title="Mark all notifications read, including those outside the current filters" onClick={() => void run(() => data.onMarkAllNotificationsRead!())}><CheckIcon size={16} />Mark all read</Button> : null}
    {error ? <span role="alert" className="athyper-activity-query__action-error">{error}</span> : null}
  </div>;
}
