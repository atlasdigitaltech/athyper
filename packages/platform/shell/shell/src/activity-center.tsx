"use client";

import {
  PinIcon, PinOffIcon, Maximize2Icon,
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
  Drawer,
  FilterChipGroup,
  PanelTabs,
  PanelContextRow,
  PanelEmptyState,
  Button,
} from "@athyper/platform-ui";
import * as React from "react";
import { useEffect, useState } from "react";
import { useWorkspaceSidePanel } from "./workspace-side-panel";
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
  const [pinned, setPinned] = useState(false);
  const [panelWidth, setPanelWidth] = useState(480);
  const [compact, setCompact] = useState(true);
  const slot = useWorkspaceSidePanel(), claim = slot?.claim, release = slot?.release;
  useEffect(()=>{const media=window.matchMedia("(max-width: 1100px)");const update=()=>setCompact(media.matches);update();media.addEventListener("change",update);return ()=>media.removeEventListener("change",update);},[]);
  useEffect(()=>{
    let observer: ResizeObserver | undefined;
    const frame=requestAnimationFrame(()=>{const panel=document.getElementById("athyper-activity-center");if(!panel)return;
      observer=new ResizeObserver(()=>setPanelWidth(panel.getBoundingClientRect().width));observer.observe(panel);});
    return ()=>{cancelAnimationFrame(frame);observer?.disconnect();};
  },[]);
  useEffect(()=>{claim?.({id:"activity-center",pinned:pinned && !compact,width:panelWidth});},[claim,pinned,compact,panelWidth]);
  useEffect(()=>()=>release?.("activity-center"),[release]);
  const activeError =
    dataSource?.errors?.[activeTab]?.message ?? dataSource?.error;
  const activeErrorStatus =
    dataSource?.errors?.[activeTab]?.status ?? dataSource?.errorStatus;
  const countsReady = Boolean(
    dataSource && !dataSource.loading && !activeError,
  );
  const notifications = dataSource?.notifications ?? [];
  const inbox = dataSource?.inbox ?? [];
  const notificationScope=dataSource?.queries?.notifications.read === "unread" ? "unread" : "all";
  const inboxScope=dataSource?.queries?.inbox.attention ? "priority" : "all";
  const setNotificationScope=(value:string)=>{const q=dataSource?.queries?.notifications;if(q)dataSource?.onQueryChange?.("notifications",{...q,read:value === "unread" ? "unread":"all"});};
  const setInboxScope=(value:string)=>{const q=dataSource?.queries?.inbox;if(q)dataSource?.onQueryChange?.("inbox",{...q,attention:value === "priority"});};
  const unreadCount = activityCount(dataSource, "notifications");
  const priorityCount = inbox.filter(
    (item) =>
      item.overdue || item.priority === "high" || item.priority === "urgent",
  ).length;
  const visibleNotifications = notifications, visibleInbox = inbox;
  const groups =
    activeTab === "notifications"
      ? groupItems(visibleNotifications)
      : groupItems(visibleInbox);
  const fullPageHref =
    activeTab === "notifications"
      ? dataSource?.notificationsHref
      : dataSource?.inboxHref;
  const accessDenied =
    activeErrorStatus === 403 ||
    (!activeErrorStatus && /\b403\b|forbidden/i.test(activeError ?? ""));
  const content = (
    <>
      {dataSource?.loading ? <ActivityLoading /> : null}
      {!dataSource?.loading && activeError ? (
        <ActivityError
          tab={activeTab}
          accessDenied={accessDenied}
          onRetry={dataSource?.onRetry}
        />
      ) : null}
      {!dataSource?.loading &&
        !activeError &&
        groups.map((group) => (
          <section className="athyper-activity-center__group" key={group.label}>
            <header>
              <strong>{group.label}</strong>
              <span>{group.items.length}</span>
            </header>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  {activeTab === "notifications" ? (
                    <ActivityNotificationRow
                      item={item as ShellNotificationItem}
                      onMarkRead={dataSource?.onMarkNotificationRead}
                      onDismiss={dataSource?.onDismissNotification}
                    />
                  ) : (
                    <ActivityInboxRow item={item as ShellInboxItem} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      {!dataSource?.loading && !activeError && !groups.length ? (
        <ActivityEmpty
          more={activeTab === "notifications" ? dataSource?.hasMoreNotifications : dataSource?.hasMoreInbox}
          onShowAll={() =>
            activeTab === "notifications"
              ? setNotificationScope("all")
              : setInboxScope("all")
          }
          tab={activeTab}
          filtered={
            activeTab === "notifications"
              ? notificationScope === "unread"
              : inboxScope === "priority"
          }
        />
      ) : null}
    </>
  );

  return (
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Panel
        pinned={pinned && !compact}
        id="athyper-activity-center"
        interactionRoots={headerActions}
        size="standard"
        variant="activity"
        mobilePresentation="fullscreen"
        className="athyper-activity-center a-context-panel"
      >
        <Drawer.Header
          appearance="panel"
          icon={<ActivityGlyph kind={activeTab} />}
          title={activeTab === "notifications" ? "Notifications" : "Inbox"}
          capabilities={{
            ...(!compact ? {pin:{label:intl.message(pinned ? "panel.unpin" : "panel.pin"),icon:pinned ? <PinOffIcon size={18}/> : <PinIcon size={18}/>,pressed:pinned,onClick:()=>setPinned(value=>!value)}} : {}),
            ...(fullPageHref ? {fullView:{label:"Open Activity center in full view",icon:<Maximize2Icon size={18}/>,href:fullPageHref}} : {}),
          }}
          closeLabel="Close activity center"
        />
        <PanelContextRow scope={{kind:"global", label:intl.message(activeTab === "notifications" ? "panel.notificationsScope" : "panel.inboxScope"), detail:intl.message("panel.currentTenant")}} />
        <PanelTabs
          label="Activity type"
          value={activeTab}
          onValueChange={(value) => onTabChange(value as ShellActivityTab)}
          items={(["notifications", "inbox"] as const).map((key) => {
            const count = activityCount(dataSource, key),
              label = key === "notifications" ? "Notifications" : "Inbox";
            return {
              key,
              label,
              count,
              id: `athyper-activity-tab-${key}`,
              panelId: `athyper-activity-content-${key}`,
              accessibleLabel: `${label}${count === undefined ? ", count unavailable" : `, ${count}`}`,
            };
          })}
        />
        {dataSource?.onQueryChange ? <ActivityQueryControls compact kind={activeTab} data={dataSource}/> : null}
        {!dataSource?.collections?.[activeTab] ? <Drawer.Toolbar className="athyper-activity-center__toolbar">
          {!dataSource?.collections?.[activeTab] ? <FilterChipGroup
            label={
              activeTab === "notifications"
                ? "Notification filters"
                : "Inbox filters"
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
                      label: "All",
                      count:
                        countsReady && !dataSource?.hasMoreNotifications
                          ? notifications.length
                          : undefined,
                    },
                    { value: "unread", label: "Unread", count: unreadCount },
                  ]
                : [
                    {
                      value: "all",
                      label: "All",
                      count:
                        countsReady && !dataSource?.hasMoreInbox
                          ? inbox.length
                          : undefined,
                    },
                    {
                      value: "priority",
                      label: "Needs attention",
                      count:
                        countsReady && !dataSource?.hasMoreInbox
                          ? priorityCount
                          : undefined,
                    },
                  ]
            }
          />
          : null}
          {activeTab === "notifications" && dataSource ? <ActivityNotificationActions data={dataSource} /> : null}
        </Drawer.Toolbar> : null}
        <Drawer.Body
          className="athyper-activity-center__content"
          data-activity-density={dataSource?.queries?.[activeTab]?.density??"comfortable"}
          aria-live="polite"
        >
          <div
            role="tabpanel"
            id={`athyper-activity-content-${activeTab}`}
            aria-labelledby={`athyper-activity-tab-${activeTab}`}
          >
            {content}
          </div>
        </Drawer.Body>
        {fullPageHref && !activeError ? (
          <Drawer.Footer className="athyper-activity-center__footer">
            <a
              href={fullPageHref}
            >
              View all {activeTab}
              <ChevronRightIcon />
            </a>
          </Drawer.Footer>
        ) : null}
      </Drawer.Panel>
    </Drawer.Root>
  );
}

export function ActivityNotificationRow({
  item,
  onMarkRead,
  onDismiss,
}: {
  readonly item: ShellNotificationItem;
  readonly onMarkRead?: ShellActivityDataSource["onMarkNotificationRead"];
  readonly onDismiss?: ShellActivityDataSource["onDismissNotification"];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch {
      setError("Could not update this notification. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="athyper-activity-row" data-unread={!!item.unread}>
      <span className="athyper-activity-row__icon" aria-hidden="true">
        <BellIcon />
      </span>
      <div className="athyper-activity-row__copy">
        <strong>
          {item.title}
          {item.unread ? (
            <span className="athyper-activity-row__unread">Unread</span>
          ) : null}
        </strong>
        {item.recordLabel ? (
          <span className="athyper-activity-row__record">
            {item.recordLabel}
          </span>
        ) : null}
        {item.detail ? <p>{item.detail}</p> : null}
        <small>
          {item.sourceLabel} ·{" "}
          <time
            dateTime={item.timestamp}
            title={new Date(item.timestamp).toLocaleString()}
          >
            {item.timestampLabel}
          </time>
        </small>
        {item.href ? (
          <a
            className="athyper-activity-row__link"
            href={item.href}
            onClick={() => {
              if (item.unread && onMarkRead) void run(() => onMarkRead(item));
            }}
          >
            {item.actionLabel ?? "View record"}
            <ChevronRightIcon size={16} />
          </a>
        ) : (
          <small>Record link unavailable</small>
        )}
        {error ? <span role="alert">{error}</span> : null}
      </div>
      {onDismiss || (item.unread && onMarkRead) ? (
        <details
          className="athyper-activity-row__menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") event.currentTarget.open = false;
          }}
        >
          <summary aria-label={`Actions for ${item.title}`}>•••</summary>
          <div>
            {item.unread && onMarkRead ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => onMarkRead(item))}
              >
                Mark as read
              </Button>
            ) : null}
            {onDismiss ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => onDismiss(item))}
              >
                Dismiss
              </Button>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}
export function ActivityInboxRow({ item }: { readonly item: ShellInboxItem }) {
  return (
    <article className="athyper-activity-row">
      <span className="athyper-activity-row__icon" aria-hidden="true">
        <InboxIcon />
      </span>
      <div className="athyper-activity-row__copy">
        <strong>{item.title}</strong>
        {item.recordLabel ? (
          <span className="athyper-activity-row__record">
            {item.recordLabel}
          </span>
        ) : null}
        {item.detail ? <p>{item.detail}</p> : null}
        <small>
          {[item.statusLabel, item.assigneeLabel].filter(Boolean).join(" · ")}
          {item.dueLabel ? (
            <span
              className="athyper-activity-row__due"
              data-overdue={item.overdue}
            >
              {" "}
              · {item.dueLabel}
            </span>
          ) : null}
        </small>
        {item.href ? (
          <a className="athyper-activity-row__link" href={item.href}>
            {item.actionLabel ?? "Open task"}
            <ChevronRightIcon size={16} />
          </a>
        ) : (
          <small>Task destination unavailable. Contact the task owner.</small>
        )}
      </div>
    </article>
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
  const notification = tab === "notifications";
  const title = more
    ? "No matches in loaded activity"
    : filtered
      ? notification
        ? "No unread notifications"
        : "Nothing needs attention"
      : notification
        ? "You’re all caught up"
        : "Your inbox is empty";
  const detail = more
    ? "Open the full view to load older activity."
    : filtered
      ? "Show all to see the rest of your activity."
      : notification
        ? "New notifications will appear here."
        : "Work assigned to you will appear here.";
  return (
    <PanelEmptyState
      icon={<ActivityGlyph kind={tab} />}
      title={title}
      description={detail}
      action={
        filtered ? (
          <Button variant="secondary" onClick={onShowAll}>
            Show all
          </Button>
        ) : undefined
      }
    />
  );
}

function ActivityLoading() {
  return (
    <div className="athyper-activity-center__loading" role="status">
      <span className="athyper-visually-hidden">Loading activity</span>
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
  return (
    <PanelEmptyState
      tone="error"
      role="alert"
      icon={accessDenied ? <InfoIcon /> : <WarningIcon />}
      title={
        accessDenied
          ? "Activity isn’t available for this account"
          : `Couldn’t load ${tab === "notifications" ? "notifications" : "your inbox"}`
      }
      description={
        accessDenied
          ? "Contact your administrator if you need access."
          : "Please try again."
      }
      action={
        !accessDenied && onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Try again
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
