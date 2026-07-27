"use client";

import { useState } from "react";
import type { Notification } from "@athyper/api-contracts";
import { useNotificationsConfig } from "../config";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../hooks/use-notifications";

const PAGE_SIZE = 25;

export function NotificationsPage() {
  const config = useNotificationsConfig();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(0);
  const notifications = useNotifications({
    unread: filter === "unread",
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const rows = notifications.data?.data ?? [];

  const open = (notification: Notification) => {
    if (!notification.is_read) markRead.mutate(notification.id);
    const href = config.resolveHref?.(notification);
    if (href) config.navigate(href);
  };

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4" aria-labelledby="notifications-title">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {config.plane}
          </p>
          <h1 id="notifications-title" className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Updates for the active context.</p>
        </div>
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={!rows.some((row) => !row.is_read) || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          Mark all read
        </button>
      </header>

      <div role="group" aria-label="Notification filter" className="flex gap-2">
        {(["all", "unread"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={`rounded-md border px-3 py-1.5 text-sm ${filter === value ? "bg-foreground text-background" : ""}`}
            onClick={() => { setFilter(value); setPage(0); }}
          >
            {value === "all" ? "All" : "Unread"}
          </button>
        ))}
      </div>

      {notifications.isLoading ? (
        <div role="status" className="rounded-lg border p-8 text-sm text-muted-foreground">
          Loading notifications…
        </div>
      ) : notifications.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-6">
          <p className="text-sm text-destructive">Unable to load notifications.</p>
          <button type="button" className="mt-3 rounded-md border px-3 py-2 text-sm" onClick={() => void notifications.refetch()}>
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {filter === "unread" ? "You have no unread notifications." : "No notifications yet."}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card" aria-label="Notification results">
          {rows.map((notification) => {
            const href = config.resolveHref?.(notification);
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => open(notification)}
                  aria-label={`${notification.title}${notification.is_read ? "" : ", unread"}${href ? "" : ", no destination"}`}
                >
                  <span className={`mt-1.5 size-2 rounded-full ${notification.is_read ? "bg-transparent" : "bg-primary"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{notification.title}</span>
                    {notification.body ? <span className="mt-1 block text-sm text-muted-foreground">{notification.body}</span> : null}
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {new Date(notification.created_at).toLocaleString()}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <nav aria-label="Notifications pagination" className="flex items-center justify-between">
        <button type="button" className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
          Previous
        </button>
        <span className="text-sm text-muted-foreground">Page {page + 1}</span>
        <button type="button" className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={!notifications.data?.hasMore} onClick={() => setPage((value) => value + 1)}>
          Next
        </button>
      </nav>
    </section>
  );
}

/** Compatibility alias retained while route packages migrate. */
export const NotificationsInbox = NotificationsPage;
