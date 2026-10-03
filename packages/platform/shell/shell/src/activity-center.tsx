"use client";

import {
  Maximize2Icon,
  MessageSquareIcon,
  FileTextIcon,
  ChevronDownIcon,
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  InboxIcon,
  InfoIcon,
  WarningIcon,
} from "@athyper/platform-icons";
import type { ActivityQuery, ActivityCollectionSnapshot, ActivitySavedViews } from "@athyper/contract-platform-activity";
import { ActivityNotificationActions } from "./activity-notification-actions";
import { ActivityQueryControls } from "./activity-query-controls";
import { activityCount } from "./activity-counts";
import {
  Tooltip,
  FilterChipGroup,
  PanelHeader,
  PanelTabs,
  PanelContextRow,
  PanelEmptyState,
  PanelRowMenu,
  Button,
} from "@athyper/platform-ui";
import * as React from "react";
import { useEffect, useState, type ReactNode } from "react";
import { WorkspaceToolPanel } from "./workspace-tool-panel";
import { useShellI18n } from "./shell-i18n";

export type ShellActivityTab = "notifications" | "inbox";
export type ShellNotificationTone = "info" | "success" | "warning" | "critical";
export type ShellInboxPriority = "normal" | "high" | "urgent";
export type ShellPushEnrollmentStatus =
  | "checking"
  | "unsupported"
  | "unavailable"
  | "prompt"
  | "enabled"
  | "denied"
  | "error";

export interface ShellNotificationItem {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly sourceLabel?: string;
  readonly groupLabel?: string;
  readonly timestamp: string;
  readonly timestampLabel: string;
  readonly href?: string;
  readonly recordLabel?: string;
  readonly actionLabel?: string;
  readonly unread?: boolean;
  readonly tone?: ShellNotificationTone;
}

export interface ShellInboxItem {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly sourceLabel?: string;
  readonly assigneeLabel?: string;
  readonly dueLabel?: string;
  readonly groupLabel?: string;
  readonly href?: string;
  readonly recordLabel?: string;
  readonly actionLabel?: string;
  readonly priority?: ShellInboxPriority;
  readonly overdue?: boolean;
  readonly statusLabel?: string;
}

export interface ShellActivityDataSource {
 readonly collections?: Partial<Record<ShellActivityTab,ActivityCollectionSnapshot>>;
 readonly savedViews?: Partial<Record<ShellActivityTab,ActivitySavedViews>>;
 readonly collectionErrors?: Partial<Record<ShellActivityTab,string>>;
 readonly onViewCommand?: (kind:ShellActivityTab,command:Record<string,unknown>)=>Promise<ActivitySavedViews>;
 readonly onPreviewQuery?: (kind:ShellActivityTab,query:ActivityQuery,signal?:AbortSignal)=>Promise<number>;

  readonly queries?: Record<ShellActivityTab, ActivityQuery>;
  readonly queryInfo?: Partial<Record<ShellActivityTab,{matchingCount?:number;viewScope?:string;facets?:{entities:string[];types:string[]}}>>;
  readonly onQueryChange?: (kind:ShellActivityTab,query:ActivityQuery)=>void;

  readonly notifications?: readonly ShellNotificationItem[];
  readonly inbox?: readonly ShellInboxItem[];
  readonly unreadNotificationCount?: number;
  readonly openInboxCount?: number;
  readonly hasMoreNotifications?: boolean;
  readonly hasMoreInbox?: boolean;
  readonly loading?: boolean;
  readonly error?: string;
  readonly errorStatus?: number;
  readonly errors?: Partial<
    Record<
      ShellActivityTab,
      { readonly message: string; readonly status?: number }
    >
  >;
  readonly notificationsHref?: string;
  readonly inboxHref?: string;
  readonly pushEnrollmentStatus?: ShellPushEnrollmentStatus;
  readonly pushEnrollmentError?: string;
  readonly onRetry?: () => void;
  readonly onDismissNotification?: (
    item: ShellNotificationItem,
  ) => void | Promise<void>;
  readonly onMarkNotificationRead?: (
    item: ShellNotificationItem,
  ) => void | Promise<void>;
  readonly onMarkAllNotificationsRead?: () => void | Promise<void>;
  /** Collapsed copies ("Show 5 similar") act as one row. Without these the
   * single-notification actions run for each copy. */
  readonly onMarkNotificationsRead?: (items: readonly ShellNotificationItem[]) => void | Promise<void>;
  readonly onDismissNotifications?: (items: readonly ShellNotificationItem[]) => void | Promise<void>;
  readonly onCompleteInboxItem?: (item: ShellInboxItem) => void | Promise<void>;
  readonly onLoadMoreNotifications?: () => void | Promise<void>;
  readonly onLoadMoreInbox?: () => void | Promise<void>;
  readonly onEnableBrowserPush?: () => void | Promise<void>;
  readonly onDisableBrowserPush?: () => void | Promise<void>;
}

interface ShellActivityCenterProps {
  readonly headerActions?: () => readonly HTMLElement[];
  readonly activeTab: ShellActivityTab;
  readonly dataSource?: ShellActivityDataSource;
  readonly onTabChange: (tab: ShellActivityTab) => void;
  readonly onClose: () => void;
}

export function ShellActivityCenter({
  headerActions,
  activeTab,
  dataSource,
  onTabChange,
  onClose,
}: ShellActivityCenterProps) {
  const intl = useShellI18n();
  const notifications = dataSource?.notifications ?? [];
  const inbox = dataSource?.inbox ?? [];
  // Query-capable sources filter on the server; otherwise the chips filter the
  // loaded items locally, so a visible chip always works.
  const queryable = Boolean(dataSource?.queries && dataSource.onQueryChange);
  const [localNotificationScope, setLocalNotificationScope] = useState<"all" | "unread">("all");
  const [localInboxScope, setLocalInboxScope] = useState<"all" | "priority">("all");
  const notificationScope = queryable ? (dataSource?.queries?.notifications.read === "unread" ? "unread" : "all") : localNotificationScope;
  const inboxScope = queryable ? (dataSource?.queries?.inbox.attention ? "priority" : "all") : localInboxScope;
  const setNotificationScope=(value:string)=>{const q=dataSource?.queries?.notifications;if(queryable&&q)dataSource?.onQueryChange?.("notifications",{...q,read:value === "unread" ? "unread":"all"});else setLocalNotificationScope(value === "unread" ? "unread" : "all");};
  const setInboxScope=(value:string)=>{const q=dataSource?.queries?.inbox;if(queryable&&q)dataSource?.onQueryChange?.("inbox",{...q,attention:value === "priority"});else setLocalInboxScope(value === "priority" ? "priority" : "all");};
  const activeError =
    dataSource?.errors?.[activeTab]?.message ?? dataSource?.error;
  const countsReady = Boolean(
    dataSource && !dataSource.loading && !activeError,
  );
  const unreadCount = activityCount(dataSource, "notifications");
  const attention = (item: ShellInboxItem) =>
    Boolean(item.overdue || item.priority === "high" || item.priority === "urgent");
  const priorityCount = inbox.filter(attention).length;
  const visibleNotifications = queryable || notificationScope === "all" ? notifications : notifications.filter((item) => item.unread),
    visibleInbox = queryable || inboxScope === "all" ? inbox : inbox.filter(attention);
  const fullPageHref =
    activeTab === "notifications"
      ? dataSource?.notificationsHref
      : dataSource?.inboxHref;
  const title = intl.message(activeTab === "notifications" ? "activity.title.notifications" : "activity.title.inbox");
  const matching = !dataSource?.loading && !activeError ? dataSource?.queryInfo?.[activeTab]?.matchingCount : undefined;
  return (
    <WorkspaceToolPanel
      id="activity-center"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      labels={{
        region: title,
        close: intl.message("activity.close"),
        pin: intl.message("panel.pin"),
        unpin: intl.message("panel.unpin"),
        resize: intl.message("activity.resize"),
      }}
      className="athyper-activity-center"
      interactionRoots={headerActions}
      panelProps={{ id: "athyper-activity-center" }}
    >
      {(frame) => (
        <>
          <PanelHeader
            icon={<ActivityGlyph kind={activeTab} />}
            title={title}
            capabilities={{
              ...(frame.capabilities.pin ? { pin: frame.capabilities.pin } : {}),
              ...(fullPageHref ? {fullView:{label:intl.message("activity.openFull", { title }),icon:<Maximize2Icon size={18}/>,href:fullPageHref}} : {}),
              ...(frame.capabilities.close ? { close: frame.capabilities.close } : {}),
            }}
          />
          {/* Like the collection controls panel: the collection, then its result count. */}
          <PanelContextRow scope={{kind:"global", label:intl.message(activeTab === "notifications" ? "panel.notificationsScope" : "panel.inboxScope"), detail:matching === undefined ? intl.message("panel.currentTenant") : intl.message(activeTab === "notifications" ? "activity.count.notifications" : "activity.count.tasks", { count: matching })}} />
          {/* No section tabs: the app bar's Notifications and Inbox open the panel on
              their section and the header names it, so the list gets the space. */}
          {dataSource?.onQueryChange ? <ActivityQueryControls compact kind={activeTab} data={dataSource}/> : null}
          {!dataSource?.collections?.[activeTab] ? <div className="athyper-activity-center__toolbar">
            <FilterChipGroup
              label={
                intl.message(activeTab === "notifications" ? "activity.filters.notifications" : "activity.filters.inbox")
              }
              value={
                activeTab === "notifications" ? notificationScope : inboxScope
              }
              onValueChange={(value) =>
                activeTab === "notifications"
                  ? setNotificationScope(value as "all" | "unread")
                  : setInboxScope(value as "all" | "priority")
              }
              items={
                activeTab === "notifications"
                  ? [
                      {
                        value: "all",
                        label: intl.message("activity.scope.all"),
                        count:
                          countsReady && !dataSource?.hasMoreNotifications
                            ? notifications.length
                            : undefined,
                      },
                      { value: "unread", label: intl.message("activity.unread"), count: unreadCount },
                    ]
                  : [
                      {
                        value: "all",
                        label: intl.message("activity.scope.all"),
                        count:
                          countsReady && !dataSource?.hasMoreInbox
                            ? inbox.length
                            : undefined,
                      },
                      {
                        value: "priority",
                        label: intl.message("activity.scope.attention"),
                        count:
                          countsReady && !dataSource?.hasMoreInbox
                            ? priorityCount
                            : undefined,
                      },
                    ]
              }
            />
            {activeTab === "notifications" && dataSource ? <ActivityNotificationActions data={dataSource} /> : null}
          </div> : null}
          <div
            className="athyper-activity-center__content"
            data-density={activityDensityOverride(dataSource, activeTab)}
            aria-live="polite"
          >
            <div role="region" id={`athyper-activity-content-${activeTab}`} aria-label={title}>
              <ActivityFeed
                kind={activeTab}
                data={dataSource}
                items={activeTab === "notifications" ? visibleNotifications : visibleInbox}
                filtered={activeTab === "notifications" ? notificationScope === "unread" : inboxScope === "priority"}
                onShowAll={() => activeTab === "notifications" ? setNotificationScope("all") : setInboxScope("all")}
                limited
              />
            </div>
          </div>
          {fullPageHref && !activeError ? (
            <footer className="athyper-activity-center__footer">
              <a href={fullPageHref}>
                {intl.message(activeTab === "notifications" ? "activity.viewAll.notifications" : "activity.viewAll.inbox")}
                <ChevronRightIcon />
              </a>
            </footer>
          ) : null}
        </>
      )}
    </WorkspaceToolPanel>
  );
}

/** Notifications | Inbox: the same section tabs in the panel and the full page. */
export function ActivitySectionTabs({
  kind,
  data,
  onChange,
}: {
  readonly kind: ShellActivityTab;
  readonly data?: ShellActivityDataSource;
  readonly onChange: (kind: ShellActivityTab) => void;
}) {
  const intl = useShellI18n();
  return (
    <PanelTabs
      label={intl.message("activity.type")}
      value={kind}
      onValueChange={(value) => onChange(value as ShellActivityTab)}
      items={(["notifications", "inbox"] as const).map((key) => {
        const count = activityCount(data, key),
          label = intl.message(key === "notifications" ? "activity.title.notifications" : "activity.title.inbox");
        return {
          key,
          label,
          count,
          id: `athyper-activity-tab-${key}`,
          panelId: `athyper-activity-content-${key}`,
          accessibleLabel:
            count === undefined
              ? intl.message("activity.countUnavailable", { label })
              : intl.message("activity.countLabel", { label, count }),
        };
      })}
    />
  );
}

/** One activity feed for the panel and the full page: loading, access and
 * failure states, grouped rows, empty states and loading more. */
export function ActivityFeed({
  kind,
  data,
  items: suppliedItems,
  filtered,
  onShowAll,
  limited = false,
  selection,
}: {
  readonly kind: ShellActivityTab;
  readonly data?: ShellActivityDataSource;
  /** Already filtered rows; defaults to everything loaded for the section. */
  readonly items?: readonly (ShellNotificationItem | ShellInboxItem)[];
  readonly filtered: boolean;
  readonly onShowAll: () => void;
  /** The panel shows what is loaded and sends the person to the full view for more. */
  readonly limited?: boolean;
  /** Full page with a reading pane: rows select the item shown beside the list. */
  readonly selection?: ActivitySelection;
}) {
  const intl = useShellI18n();
  const [actionError, setActionError] = useState<string>();
  const error = data?.errors?.[kind]?.message ?? data?.error;
  const status = data?.errors?.[kind]?.status ?? data?.errorStatus;
  const denied = status === 403 || (!status && /\b403\b|forbidden/i.test(error ?? ""));
  const items =
    suppliedItems ?? (kind === "notifications" ? data?.notifications : data?.inbox) ?? [];
  const more = kind === "notifications" ? data?.hasMoreNotifications : data?.hasMoreInbox;
  if (data?.loading && !items.length) return <ActivityLoading />;
  if (error) return <ActivityError tab={kind} accessDenied={denied} onRetry={data?.onRetry} />;
  if (!items.length)
    return <ActivityEmpty tab={kind} filtered={filtered} more={limited ? more : false} onShowAll={onShowAll} />;
  return (
    <>
      {actionError ? <p role="alert">{actionError}</p> : null}
      {/* One surface with the list's group bands, in the panel and on the page. */}
      <div className="athyper-activity-feed a-panel-list">
      {groupItems(items).map((group) => (
        <section className="athyper-activity-center__group a-panel-list__group" key={group.label}>
          {group.label ? (
            <header>
              <strong>{group.label}</strong>
              <span>{group.items.length}</span>
            </header>
          ) : null}
          <ul>
            {kind === "notifications"
              ? collapseSimilar(group.items as readonly ShellNotificationItem[]).map((entry) => (
                  <li key={entry.item.id}>
                    {entry.similar.length ? (
                      <SimilarNotifications entry={entry} data={data} selection={selection} />
                    ) : (
                      <ActivityNotificationRow
                        item={entry.item}
                        onMarkRead={data?.onMarkNotificationRead}
                        onDismiss={data?.onDismissNotification}
                        selection={selection}
                      />
                    )}
                  </li>
                ))
              : group.items.map((item) => (
                  <li key={item.id}>
                    <ActivityInboxRow item={item as ShellInboxItem} selection={selection} />
                  </li>
                ))}
          </ul>
        </section>
      ))}
      </div>
      {!limited && more ? (
        <div className="athyper-activity-page__more">
          <span>{intl.message("activity.loaded", { count: items.length })}</span>
          <Button
            variant="secondary"
            onClick={() =>
              void Promise.resolve(
                kind === "notifications"
                  ? data?.onLoadMoreNotifications?.()
                  : data?.onLoadMoreInbox?.(),
              ).catch(() => setActionError(intl.message("activity.loadMoreFailed")))
            }
          >
            {intl.message("activity.loadMore")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Reading-pane selection for rows on the full page (80rem and wider). */
export interface ActivitySelection {
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
  /** The reading pane's id, for aria-controls. */
  readonly controls: string;
}

/** Row props for selection: the title becomes the control that shows the item
 * in the reading pane; a click elsewhere on the row (not on its link or menu)
 * does the same, and Up/Down move between rows. */
function selectable(id: string, selection: ActivitySelection | undefined) {
  if (!selection) return undefined;
  const selected = selection.selectedId === id;
  return {
    selected,
    article: {
      "data-selected": selected,
      "data-selectable": true,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (!(event.target as HTMLElement).closest("a,button,summary,details,input")) selection.onSelect(id);
      },
    },
    button: {
      type: "button" as const,
      className: "athyper-activity-row__select",
      "data-activity-select": id,
      "aria-current": selected ? ("true" as const) : undefined,
      "aria-controls": selection.controls,
      onClick: () => selection.onSelect(id),
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const root = event.currentTarget.closest("[data-activity-list]") ?? document;
        const all = [...root.querySelectorAll<HTMLButtonElement>("[data-activity-select]")].filter(
          (candidate) => candidate.offsetParent !== null,
        );
        const next = all[all.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
        if (!next) return;
        event.preventDefault();
        next.focus();
        next.click();
      },
    },
  };
}

/** What happened, at a glance: comments, work, record changes, warnings. */
export function NotificationTypeIcon({ item }: { readonly item: ShellNotificationItem }) {
  if (item.tone === "critical" || item.tone === "warning") return <WarningIcon />;
  if (!item.href) return <InfoIcon />;
  switch ((item.sourceLabel ?? "").toLowerCase()) {
    case "collaboration":
      return <MessageSquareIcon />;
    case "workflow":
      return <ClipboardCheckIcon />;
    case "entity":
    case "record":
      return <FileTextIcon />;
    default:
      return item.tone === "success" ? <CircleCheckIcon /> : <BellIcon />;
  }
}

/** One notification in the list-card anatomy shared with entity lists: type
 * icon, title and time, summary, then the action and its context. Unread is a
 * dot and a stronger title, never a filled row. */
export function ActivityNotificationRow({
  item,
  onMarkRead,
  onDismiss,
  similar,
  selection,
  groupSize = 1,
}: {
  readonly item: ShellNotificationItem;
  readonly onMarkRead?: ShellActivityDataSource["onMarkNotificationRead"];
  readonly onDismiss?: ShellActivityDataSource["onDismissNotification"];
  /** Disclosure for identical notifications collapsed under this one. */
  readonly similar?: ReactNode;
  readonly selection?: ActivitySelection;
  /** How many notifications this row stands for; its actions cover them all. */
  readonly groupSize?: number;
}) {
  const intl = useShellI18n();
  const select = selectable(item.id, selection);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
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
  // The type icon already says where it came from; the meta line names the record.
  const context = item.recordLabel ?? "";
  return (
    <article
      className="athyper-activity-row a-panel-row"
      data-unread={!!item.unread}
      data-available={item.href ? undefined : "false"}
      {...select?.article}
    >
      <span className="athyper-activity-row__icon a-panel-row__icon" data-tone={item.tone} aria-hidden="true">
        <NotificationTypeIcon item={item} />
      </span>
      <div className="athyper-activity-row__copy a-panel-row__copy">
        <div className="athyper-activity-row__heading a-panel-row__heading">
          {/* Titles, summaries and record names are user content: they keep their own direction. */}
          <strong dir="auto">{select ? <button {...select.button}>{item.title}</button> : item.title}</strong>
          {item.unread ? <span className="athyper-visually-hidden">, {intl.message("activity.unread")}</span> : null}
          <time
            dateTime={item.timestamp}
            title={intl.date(item.timestamp, { dateStyle: "full", timeStyle: "short" })}
          >
            {item.timestampLabel}
          </time>
        </div>
        {item.detail ? <p dir="auto">{item.detail}</p> : null}
        <div className="athyper-activity-row__meta a-panel-row__meta">
          {item.href ? (
            <a
              className="athyper-activity-row__link"
              href={item.href}
              onClick={() => {
                if (item.unread && onMarkRead) void run(() => onMarkRead(item));
              }}
            >
              {item.actionLabel ?? intl.message("activity.detail.viewRecord")}
              <ChevronRightIcon size={14} />
            </a>
          ) : (
            <span className="athyper-activity-row__unavailable">{intl.message("activity.recordUnavailable")}</span>
          )}
          {context ? <span dir="auto">{context}</span> : null}
          {similar}
        </div>
        {error ? <span role="alert">{error}</span> : null}
      </div>
      {onDismiss || (item.unread && onMarkRead) ? (
        <PanelRowMenu
          className="athyper-activity-row__menu"
          label={intl.message("activity.actionsFor", { title: item.title })}
        >
            {item.unread && onMarkRead ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => onMarkRead(item))}
              >
                {groupSize > 1 ? intl.message("activity.markGroupRead", { count: groupSize }) : intl.message("activity.markRead")}
              </Button>
            ) : null}
            {onDismiss ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => onDismiss(item))}
              >
                {groupSize > 1 ? intl.message("activity.dismissGroup", { count: groupSize }) : intl.message("activity.dismiss")}
              </Button>
            ) : null}
        </PanelRowMenu>
      ) : null}
    </article>
  );
}
export function ActivityInboxRow({
  item,
  selection,
}: {
  readonly item: ShellInboxItem;
  readonly selection?: ActivitySelection;
}) {
  const intl = useShellI18n();
  const select = selectable(item.id, selection);
  const context = [item.recordLabel, item.statusLabel, item.assigneeLabel].filter(Boolean).join(" · ");
  return (
    <article className="athyper-activity-row a-panel-row" data-available={item.href ? undefined : "false"} {...select?.article}>
      <span className="athyper-activity-row__icon a-panel-row__icon" data-priority={item.priority} aria-hidden="true">
        <ClipboardCheckIcon />
      </span>
      <div className="athyper-activity-row__copy a-panel-row__copy">
        <div className="athyper-activity-row__heading a-panel-row__heading">
          <strong dir="auto">{select ? <button {...select.button}>{item.title}</button> : item.title}</strong>
          {item.dueLabel ? (
            <span className="athyper-activity-row__due" data-overdue={item.overdue}>
              {item.dueLabel}
            </span>
          ) : null}
        </div>
        {item.detail ? <p dir="auto">{item.detail}</p> : null}
        <div className="athyper-activity-row__meta a-panel-row__meta">
          {item.href ? (
            <a className="athyper-activity-row__link" href={item.href}>
              {item.actionLabel ?? intl.message("activity.detail.openTask")}
              <ChevronRightIcon size={14} />
            </a>
          ) : (
            <span className="athyper-activity-row__unavailable">{intl.message("activity.taskUnavailable")}</span>
          )}
          {context ? <span dir="auto">{context}</span> : null}
        </div>
      </div>
    </article>
  );
}

/** Mark as read and Dismiss for a row that stands for several identical
 * notifications: they apply to every copy, never only the first. */
export function notificationGroupActions(
  data: ShellActivityDataSource | undefined,
  group: readonly ShellNotificationItem[],
): { readonly markRead?: () => Promise<void>; readonly dismiss?: () => Promise<void> } {
  const markOne = data?.onMarkNotificationRead,
    dismissOne = data?.onDismissNotification;
  const unread = group.filter((item) => item.unread);
  return {
    ...(markOne && unread.length
      ? {
          markRead: async () => {
            if (data?.onMarkNotificationsRead) await data.onMarkNotificationsRead(unread);
            else await Promise.all(unread.map((item) => markOne(item)));
          },
        }
      : {}),
    ...(dismissOne
      ? {
          dismiss: async () => {
            if (data?.onDismissNotifications) await data.onDismissNotifications(group);
            else await Promise.all(group.map((item) => dismissOne(item)));
          },
        }
      : {}),
  };
}

/** The rows a feed shows, in order, with the notifications collapsed under
 * each (the reading pane resolves its selection against these). */
export function activityEntries(
  kind: ShellActivityTab,
  items: readonly (ShellNotificationItem | ShellInboxItem)[],
): readonly { readonly item: ShellNotificationItem | ShellInboxItem; readonly similar: readonly ShellNotificationItem[] }[] {
  type Entry = { readonly item: ShellNotificationItem | ShellInboxItem; readonly similar: readonly ShellNotificationItem[] };
  return groupItems(items).flatMap((group): readonly Entry[] =>
    kind === "notifications"
      ? collapseSimilar(group.items as readonly ShellNotificationItem[])
      : group.items.map((item) => ({ item, similar: [] })),
  );
}

/** Consecutive notifications that say exactly the same thing about the same
 * place collapse into one row ("Record update unavailable" six times). */
export function collapseSimilar(
  items: readonly ShellNotificationItem[],
): readonly { readonly item: ShellNotificationItem; readonly similar: readonly ShellNotificationItem[] }[] {
  const key = (item: ShellNotificationItem) =>
    [item.title, item.detail ?? "", item.recordLabel ?? "", item.href ?? ""].join("\u0000");
  const entries: { item: ShellNotificationItem; similar: ShellNotificationItem[] }[] = [];
  for (const item of items) {
    const previous = entries.at(-1);
    if (previous && key(previous.item) === key(item)) previous.similar.push(item);
    else entries.push({ item, similar: [] });
  }
  return entries;
}

function SimilarNotifications({
  entry,
  data,
  selection,
}: {
  readonly entry: { readonly item: ShellNotificationItem; readonly similar: readonly ShellNotificationItem[] };
  readonly data?: ShellActivityDataSource;
  readonly selection?: ActivitySelection;
}) {
  const group = [entry.item, ...entry.similar];
  const actions = notificationGroupActions(data, group);
  const intl = useShellI18n();
  const [open, setOpen] = useState(false);
  const id = `athyper-activity-similar-${entry.item.id}`;
  const count = entry.similar.length;
  const summary = { ...entry.item, unread: entry.item.unread || entry.similar.some((item) => item.unread) };
  return (
    <>
      <ActivityNotificationRow
        item={summary}
        onMarkRead={actions.markRead}
        onDismiss={actions.dismiss}
        groupSize={group.length}
        selection={selection}
        similar={
          <button
            type="button"
            className="athyper-activity-row__similar"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? intl.message("activity.hideSimilar") : intl.message("activity.showSimilar", { count })}
            <ChevronDownIcon size={14} className="a-disclosure-caret a-disclosure-caret--menu" aria-hidden="true" />
          </button>
        }
      />
      <ul id={id} className="athyper-activity-row__similar-list" hidden={!open}>
        {entry.similar.map((item) => (
          <li key={item.id}>
            <ActivityNotificationRow
              item={item}
              onMarkRead={data?.onMarkNotificationRead}
              onDismiss={data?.onDismissNotification}
              selection={selection}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function ActivityEmpty({
  more,
  tab,
  filtered,
  onShowAll,
}: {
  readonly tab: ShellActivityTab;
  readonly more?: boolean;
  readonly filtered: boolean;
  readonly onShowAll: () => void;
}) {
  const intl = useShellI18n();
  const notification = tab === "notifications";
  const title = intl.message(
    more
      ? "activity.empty.more.title"
      : filtered
        ? notification
          ? "activity.empty.unread.title"
          : "activity.empty.attention.title"
        : notification
          ? "activity.empty.notifications.title"
          : "activity.empty.inbox.title",
  );
  const detail = intl.message(
    more
      ? "activity.empty.more.detail"
      : filtered
        ? "activity.empty.filtered.detail"
        : notification
          ? "activity.empty.notifications.detail"
          : "activity.empty.inbox.detail",
  );
  return (
    <PanelEmptyState
      icon={<ActivityGlyph kind={tab} />}
      title={title}
      description={detail}
      action={
        filtered ? (
          <Button variant="secondary" onClick={onShowAll}>
            {intl.message("activity.showAll")}
          </Button>
        ) : undefined
      }
    />
  );
}

function ActivityLoading() {
  const intl = useShellI18n();
  return (
    <div className="athyper-activity-center__loading" role="status">
      <span className="athyper-visually-hidden">{intl.message("activity.loading")}</span>
      {[0, 1, 2, 3].map((item) => (
        <i key={item} />
      ))}
    </div>
  );
}
function ActivityError({
  tab,
  accessDenied,
  onRetry,
}: {
  readonly tab: ShellActivityTab;
  readonly accessDenied: boolean;
  readonly onRetry?: () => void;
}) {
  const intl = useShellI18n();
  return (
    <PanelEmptyState
      tone="error"
      role="alert"
      icon={accessDenied ? <InfoIcon /> : <WarningIcon />}
      title={intl.message(
        accessDenied
          ? "activity.error.denied.title"
          : tab === "notifications"
            ? "activity.error.notifications.title"
            : "activity.error.inbox.title",
      )}
      description={intl.message(accessDenied ? "activity.error.denied.detail" : "activity.error.retry.detail")}
      action={
        !accessDenied && onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {intl.message("activity.retry")}
          </Button>
        ) : undefined
      }
    />
  );
}

function groupItems<T extends { readonly groupLabel?: string }>(
  items: readonly T[],
): readonly { readonly label: string; readonly items: readonly T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = item.groupLabel ?? "Recent";
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return Array.from(groups, ([label, groupedItems]) => ({
    label,
    items: groupedItems,
  }));
}
function ActivityGlyph({ kind }: { readonly kind: ShellActivityTab }) {
  return kind === "notifications" ? <BellIcon /> : <InboxIcon />;
}
function NotificationToneGlyph({
  tone,
}: {
  readonly tone: ShellNotificationTone;
}) {
  return tone === "critical" || tone === "warning" ? (
    <WarningIcon />
  ) : tone === "success" ? (
    <CircleCheckIcon />
  ) : (
    <InfoIcon />
  );
}
function InboxItemGlyph() {
  return <ClipboardCheckIcon />;
}

/** Activity follows the app density (Utilities) like every list; it sets its
 * own only when the person chose a different density in Display settings. */
export function activityDensityOverride(
  data: ShellActivityDataSource | undefined,
  kind: ShellActivityTab,
): "compact" | "comfortable" | "spacious" | undefined {
  const chosen = data?.queries?.[kind]?.density;
  const standard = data?.collections?.[kind]?.configuration.defaultState.density;
  return chosen && standard && chosen !== standard && (chosen === "compact" || chosen === "comfortable" || chosen === "spacious")
    ? chosen
    : undefined;
}
