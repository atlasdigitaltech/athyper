"use client";
import * as React from "react";
import { useEffect, useId, useState } from "react";
import { ClipboardCheckIcon, ChevronRightIcon } from "@athyper/platform-icons";
import { BREAKPOINT_SCALE } from "@athyper/platform-theme/tokens";
import { Button } from "@athyper/platform-ui";
import {
  NotificationTypeIcon,
  notificationGroupActions,
  type ShellActivityDataSource,
  type ShellActivityTab,
  type ShellInboxItem,
  type ShellNotificationItem,
} from "./activity-center";
import { useShellI18n } from "./shell-i18n";

/** True while `element` is at least the extraWide tier (80rem): room for the
 * list and a reading pane side by side. Below it the feed stays one column. */
export function useReadingPane(element: HTMLElement | null): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setWide(element.getBoundingClientRect().width >= BREAKPOINT_SCALE.extraWide * rem);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [element]);
  return wide;
}

/** The selected notification or task in full: everything the row clamps, its
 * record, and the actions the collection publishes (no others). */
export function ActivityDetail({
  id,
  kind,
  item,
  similar = [],
  data,
}: {
  readonly id: string;
  readonly kind: ShellActivityTab;
  readonly item: ShellNotificationItem | ShellInboxItem;
  /** Identical notifications collapsed under this one. */
  readonly similar?: readonly ShellNotificationItem[];
  readonly data?: ShellActivityDataSource;
}) {
  const intl = useShellI18n();
  const heading = useId();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  useEffect(() => setError(undefined), [item.id]);
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch {
      setError(intl.message("activity.detail.actionFailed"));
    } finally {
      setBusy(false);
    }
  };
  // The person's language and time zone, not the browser's.
  const when = (timestamp: string) => intl.date(timestamp, { dateStyle: "full", timeStyle: "short" });
  const facts: [string, string | undefined][] = [];
  let header: React.ReactNode, actions: React.ReactNode;
  if (kind === "notifications") {
    // A row with collapsed copies stands for all of them: so do its actions.
    const notification = item as ShellNotificationItem;
    const group = [notification, ...similar];
    const { markRead, dismiss } = notificationGroupActions(data, group);
    const unread = group.some((member) => member.unread);
    facts.push(
      [intl.message("activity.detail.record"), notification.recordLabel],
      [intl.message("activity.detail.source"), notification.sourceLabel],
    );
    header = (
      <>
        <span className="athyper-activity-row__icon a-panel-row__icon" data-tone={notification.tone} aria-hidden="true">
          <NotificationTypeIcon item={notification} />
        </span>
        <div className="athyper-activity-detail__heading">
          <h2 id={heading} dir="auto">{notification.title}</h2>
          <p>
            <time dateTime={notification.timestamp}>{when(notification.timestamp)}</time>
            <span aria-hidden="true"> · </span>
            <span>{notification.timestampLabel}</span>
            {unread ? (
              <span className="athyper-activity-detail__state">{intl.message("activity.unread")}</span>
            ) : null}
          </p>
        </div>
      </>
    );
    actions = (
      <>
        {notification.href ? (
          <a
            className="a-button a-button--primary a-button--medium"
            href={notification.href}
            onClick={() => {
              if (markRead) void run(markRead);
            }}
          >
            {notification.actionLabel ?? intl.message("activity.detail.viewRecord")}
            <ChevronRightIcon size={16} />
          </a>
        ) : (
          <span className="athyper-activity-row__unavailable">{intl.message("activity.recordUnavailable")}</span>
        )}
        {markRead ? (
          <Button variant="secondary" disabled={busy} onClick={() => void run(markRead)}>
            {group.length > 1 ? intl.message("activity.markGroupRead", { count: group.length }) : intl.message("activity.markRead")}
          </Button>
        ) : null}
        {dismiss ? (
          <Button variant="ghost" disabled={busy} onClick={() => void run(dismiss)}>
            {group.length > 1 ? intl.message("activity.dismissGroup", { count: group.length }) : intl.message("activity.dismiss")}
          </Button>
        ) : null}
      </>
    );
  } else {
    const task = item as ShellInboxItem;
    facts.push(
      [intl.message("activity.detail.record"), task.recordLabel],
      [intl.message("activity.detail.status"), task.statusLabel],
      [intl.message("activity.detail.assignee"), task.assigneeLabel],
      [intl.message("activity.detail.type"), task.sourceLabel],
    );
    header = (
      <>
        <span className="athyper-activity-row__icon a-panel-row__icon" data-priority={task.priority} aria-hidden="true">
          <ClipboardCheckIcon />
        </span>
        <div className="athyper-activity-detail__heading">
          <h2 id={heading} dir="auto">{task.title}</h2>
          <p>
            {task.dueLabel ? (
              <span className="athyper-activity-row__due" data-overdue={task.overdue}>
                {task.dueLabel}
              </span>
            ) : null}
            {task.priority && task.priority !== "normal" ? (
              <span className="athyper-activity-detail__state" data-priority={task.priority}>
                {intl.message(`activity.detail.priority.${task.priority}`)}
              </span>
            ) : null}
          </p>
        </div>
      </>
    );
    actions = task.href ? (
      <a className="a-button a-button--primary a-button--medium" href={task.href}>
        {task.actionLabel ?? intl.message("activity.detail.openTask")}
        <ChevronRightIcon size={16} />
      </a>
    ) : (
      <span className="athyper-activity-row__unavailable">{intl.message("activity.taskUnavailable")}</span>
    );
  }
  const shown = facts.filter((fact): fact is [string, string] => Boolean(fact[1]));
  return (
    <section
      id={id}
      className="athyper-activity-detail"
      aria-labelledby={heading}
      data-unread={kind === "notifications" ? [item as ShellNotificationItem, ...similar].some((member) => member.unread) || undefined : undefined}
    >
      <header className="athyper-activity-detail__header">{header}</header>
      {item.detail ? <p className="athyper-activity-detail__body" dir="auto">{item.detail}</p> : null}
      {shown.length ? (
        <dl className="athyper-activity-detail__facts">
          {shown.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd dir="auto">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {similar.length ? (
        <section className="athyper-activity-detail__similar" aria-label={intl.message("activity.detail.similar", { count: similar.length })}>
          <h3>{intl.message("activity.detail.similar", { count: similar.length })}</h3>
          <ul>
            {similar.map((other) => (
              <li key={other.id}>
                <time dateTime={other.timestamp}>{when(other.timestamp)}</time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="athyper-activity-detail__actions">{actions}</div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

/** Nothing selected yet, or the selection left the list. */
export function ActivityDetailEmpty({ kind }: { readonly kind: ShellActivityTab }) {
  const intl = useShellI18n();
  return (
    <p className="athyper-activity-detail athyper-activity-detail--empty">
      {intl.message(kind === "notifications" ? "activity.detail.selectNotification" : "activity.detail.selectTask")}
    </p>
  );
}
