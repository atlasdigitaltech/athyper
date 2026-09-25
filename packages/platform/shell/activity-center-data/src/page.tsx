"use client";
import {
  ContentHeader,
  ActivityQueryControls,
  ActivityNotificationActions,
  ActivityNotificationRow,
  ActivityInboxRow,
  type ShellInboxItem,
  type ShellNotificationItem,
} from "@athyper/platform-shell";
import { BellIcon, InboxIcon } from "@athyper/platform-icons";
import {
  Button,
  PanelTabs,
  FilterChipGroup,
  PanelEmptyState,
} from "@athyper/platform-ui";
import { useState } from "react";
import { defaultActivityQuery } from "@athyper/contract-platform-activity";
import { NotificationControls } from "./notification-controls";
import { useActivityCenterData } from "./index";

export function ActivityCenterPage({
  kind,
}: {
  readonly kind: "notifications" | "inbox";
}) {
  const data = useActivityCenterData();
  const [settings, setSettings] = useState(false),
    [actionError, setActionError] = useState<string>();
  const query = data.queries?.[kind];
  const defaults = defaultActivityQuery(kind, query?.timeZone);
  const filtered =
    query &&
    Object.keys(defaults).some(
      (key) =>
        !["sort", "group", "density", "timeZone"].includes(key) &&
        query[key as keyof typeof query] !==
          defaults[key as keyof typeof defaults],
    );
  const clear = () => {
    if (query)
      data.onQueryChange?.(kind, {
        ...defaults,
        sort: query.sort,
        group: query.group,
        density: query.density,
      });
  };
  const scope = (
    kind === "notifications" ? query?.read === "unread" : query?.attention
  )
    ? "attention"
    : "all";
  const setScope = (value: string) => {
    if (query)
      data.onQueryChange?.(kind, {
        ...query,
        ...(kind === "notifications"
          ? { read: value === "attention" ? "unread" : "all" }
          : { attention: value === "attention" }),
      });
  };
  const error = data.errors?.[kind]?.message ?? data.error;
  const denied = (data.errors?.[kind]?.status ?? data.errorStatus) === 403;
  const notifications = data.notifications ?? [],
    inbox = data.inbox ?? [];
  const all = kind === "notifications" ? notifications : inbox;
  const items = all;
  const count = (tab: "notifications" | "inbox") =>
    data.loading || data.errors?.[tab] || data.error
      ? undefined
      : tab === "notifications"
        ? data.unreadNotificationCount
        : data.openInboxCount;
  const more =
    kind === "notifications" ? data.hasMoreNotifications : data.hasMoreInbox;
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const group = item.groupLabel ?? "";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return (
    <section
      className="athyper-activity-page"
      data-activity-density={query?.density}
      aria-labelledby="activity-page-title"
    >
      <ContentHeader
        title="Activity center"
        titleId="activity-page-title"
        description="Updates and work that need your attention."
        actions={
          kind === "notifications" ? (
            <Button
              variant="secondary"
              aria-expanded={settings}
              aria-controls="activity-preferences"
              onClick={() => setSettings((value) => !value)}
            >
              Notification preferences
            </Button>
          ) : undefined
        }
      />
      <PanelTabs
        label="Activity type"
        value={kind}
        onValueChange={(value) => {
          window.location.assign(
            value === "inbox"
              ? (data.inboxHref ?? "/inbox")
              : (data.notificationsHref ?? "/notifications"),
          );
        }}
        items={[
          {
            key: "notifications",
            label: "Notifications",
            count: count("notifications"),
            panelId: "activity-content",
          },
          {
            key: "inbox",
            label: "Inbox",
            count: count("inbox"),
            panelId: "activity-content",
          },
        ]}
      />
      {settings ? (
        <div id="activity-preferences">
          <NotificationControls expanded />
        </div>
      ) : null}
      <ActivityQueryControls kind={kind} data={data} />
      {!data.collections?.[kind] ? <div className="athyper-activity-page__toolbar">
        {!data.collections?.[kind] ? <FilterChipGroup
          label={
            kind === "notifications" ? "Notification filters" : "Inbox filters"
          }
          value={scope}
          onValueChange={setScope}
          items={[
            { value: "all", label: "All" },
            {
              value: "attention",
              label: kind === "notifications" ? "Unread" : "Needs attention",
            },
          ]}
        />
        : null}
        {kind === "notifications" ? <ActivityNotificationActions data={data} /> : null}
      </div> : null}
      <div
        id="activity-content"
        role="tabpanel"
        aria-label={kind === "notifications" ? "Notifications" : "Inbox"}
      >
        {actionError ? <p role="alert">{actionError}</p> : null}
        {data.loading && !all.length ? (
          <PanelEmptyState icon={<BellIcon />} title="Loading activity…" />
        ) : error ? (
          <PanelEmptyState
            icon={<InboxIcon />}
            title={denied ? "Access required" : "Activity couldn't be loaded"}
            description={
              denied
                ? "Ask your administrator to review your access."
                : "Please try again."
            }
            action={
              !denied ? (
                <Button variant="secondary" onClick={data.onRetry}>
                  Try again
                </Button>
              ) : undefined
            }
          />
        ) : items.length ? (
          <>
            {[...groups].map(([label, rows]) => (
              <section className="athyper-activity-page__group" key={label}>
                {label ? <h2>{label}</h2> : null}
                <ul className="athyper-activity-feed">
                  {rows.map((item) => (
                    <li key={item.id}>
                      {kind === "notifications" ? (
                        <ActivityNotificationRow
                          item={item as ShellNotificationItem}
                          onMarkRead={data.onMarkNotificationRead}
                          onDismiss={data.onDismissNotification}
                        />
                      ) : (
                        <ActivityInboxRow item={item as ShellInboxItem} />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <PanelEmptyState
            icon={kind === "notifications" ? <BellIcon /> : <InboxIcon />}
            title={
              filtered
                ? "No matching activity"
                : kind === "notifications"
                  ? "You're all caught up"
                  : "Nothing needs your attention"
            }
            description={
              filtered
                ? "Try another search or clear your filters."
                : "New activity will appear here automatically."
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={clear}>
                  Show all
                </Button>
              ) : undefined
            }
          />
        )}
        {!error && more ? (
          <div className="athyper-activity-page__more">
            <span>{all.length} items loaded</span>
            <Button
              variant="secondary"
              onClick={() =>
                void Promise.resolve(
                  kind === "notifications"
                    ? data.onLoadMoreNotifications?.()
                    : data.onLoadMoreInbox?.(),
                ).catch(() =>
                  setActionError("Could not load more activity. Try again."),
                )
              }
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}