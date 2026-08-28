"use client";

import { BellIcon, CheckIcon, ChevronRightIcon, CircleCheckIcon, ClipboardCheckIcon, CloseIcon, InboxIcon, InfoIcon, WarningIcon } from "@athyper/platform-icons";
import * as React from "react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

export type ShellActivityTab = "notifications" | "inbox";
export type ShellNotificationTone = "info" | "success" | "warning" | "critical";
export type ShellInboxPriority = "normal" | "high" | "urgent";
export type ShellPushEnrollmentStatus = "checking" | "unsupported" | "unavailable" | "prompt" | "enabled" | "denied" | "error";

export interface ShellNotificationItem {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly sourceLabel?: string;
  readonly groupLabel?: string;
  readonly timestamp: string;
  readonly timestampLabel: string;
  readonly href?: string;
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
  readonly priority?: ShellInboxPriority;
}

export interface ShellActivityDataSource {
  readonly notifications?: readonly ShellNotificationItem[];
  readonly inbox?: readonly ShellInboxItem[];
  readonly unreadNotificationCount?: number;
  readonly openInboxCount?: number;
  readonly hasMoreNotifications?: boolean;
  readonly hasMoreInbox?: boolean;
  readonly loading?: boolean;
  readonly error?: string;
  readonly notificationsHref?: string;
  readonly inboxHref?: string;
  readonly pushEnrollmentStatus?: ShellPushEnrollmentStatus;
  readonly pushEnrollmentError?: string;
  readonly onRetry?: () => void;
  readonly onMarkNotificationRead?: (item: ShellNotificationItem) => void | Promise<void>;
  readonly onMarkAllNotificationsRead?: () => void | Promise<void>;
  readonly onCompleteInboxItem?: (item: ShellInboxItem) => void | Promise<void>;
  readonly onLoadMoreNotifications?: () => void | Promise<void>;
  readonly onLoadMoreInbox?: () => void | Promise<void>;
  readonly onEnableBrowserPush?: () => void | Promise<void>;
  readonly onDisableBrowserPush?: () => void | Promise<void>;
}

interface ShellActivityCenterProps {
  readonly activeTab: ShellActivityTab;
  readonly dataSource?: ShellActivityDataSource;
  readonly onTabChange: (tab: ShellActivityTab) => void;
  readonly onClose: () => void;
}

export function ShellActivityCenter({ activeTab, dataSource, onTabChange, onClose }: ShellActivityCenterProps) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [portalReady, setPortalReady] = useState(false);
  const notifications = dataSource?.notifications ?? [];
  const inbox = dataSource?.inbox ?? [];
  const [notificationScope, setNotificationScope] = useState<"all" | "unread">("all");
  const [inboxScope, setInboxScope] = useState<"all" | "priority">("all");
  const unreadCount = dataSource?.unreadNotificationCount ?? notifications.filter((item) => item.unread).length;
  const priorityCount = inbox.filter((item) => item.priority === "high" || item.priority === "urgent").length;
  const visibleNotifications = notificationScope === "unread" ? notifications.filter((item) => item.unread) : notifications;
  const visibleInbox = inboxScope === "priority" ? inbox.filter((item) => item.priority === "high" || item.priority === "urgent") : inbox;
  const groups = activeTab === "notifications"
    ? groupItems(visibleNotifications)
    : groupItems(visibleInbox);
  const fullPageHref = activeTab === "notifications" ? dataSource?.notificationsHref : dataSource?.inboxHref;

  useEffect(() => setPortalReady(true), []);
  useEffect(() => {
    if (!portalReady) return;
    closeButton.current?.focus();
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
      const first = focusable[0], last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [onClose, portalReady]);

  if (!portalReady) return null;
  return createPortal(<>
    <button className="athyper-activity-center__scrim" type="button" aria-label="Close activity center" onClick={onClose} />
    <aside ref={panel} id="athyper-activity-center" className="athyper-activity-center" role="dialog" aria-modal="true" aria-labelledby="athyper-activity-center-title">
      <header className="athyper-activity-center__header">
        <span className="athyper-activity-center__hero" data-tab={activeTab} aria-hidden="true"><ActivityGlyph kind={activeTab}/></span>
        <span>
          <strong id="athyper-activity-center-title">Activity center</strong>
          <small>Updates and work that need your attention</small>
        </span>
        <button ref={closeButton} className="athyper-activity-center__close" type="button" aria-label="Close activity center" onClick={onClose}><CloseIcon size={18}/></button>
      </header>

      <div className="athyper-activity-center__tabs" role="tablist" aria-label="Activity type">
        <ActivityTab label="Notifications" kind="notifications" count={unreadCount} active={activeTab === "notifications"} onSelect={onTabChange}/>
        <ActivityTab label="Inbox" kind="inbox" count={dataSource?.openInboxCount ?? inbox.length} active={activeTab === "inbox"} onSelect={onTabChange}/>
      </div>

      <div className="athyper-activity-center__toolbar">
        <div className="athyper-activity-center__filters" aria-label={`${activeTab === "notifications" ? "Notification" : "Inbox"} filters`}>
          {activeTab === "notifications" ? <>
            <FilterButton label="All" count={notifications.length} active={notificationScope === "all"} onClick={() => setNotificationScope("all")}/>
            <FilterButton label="Unread" count={unreadCount} active={notificationScope === "unread"} onClick={() => setNotificationScope("unread")}/>
          </> : <>
            <FilterButton label="All" count={inbox.length} active={inboxScope === "all"} onClick={() => setInboxScope("all")}/>
            <FilterButton label="Priority" count={priorityCount} active={inboxScope === "priority"} onClick={() => setInboxScope("priority")}/>
          </>}
        </div>
        {activeTab === "notifications" ? <div className="athyper-activity-center__toolbar-actions">
          {unreadCount > 0 && dataSource?.onMarkAllNotificationsRead ? <button className="athyper-activity-center__quiet-action" type="button" onClick={() => void dataSource.onMarkAllNotificationsRead?.()}>Mark all read</button> : null}
          <PushEnrollmentControl dataSource={dataSource}/>
        </div> : null}
      </div>

      <div id="athyper-activity-center-content" className="athyper-activity-center__content" role="tabpanel" aria-labelledby={`athyper-activity-tab-${activeTab}`} aria-live="polite">
        {dataSource?.loading ? <ActivityLoading/> : null}
        {!dataSource?.loading && dataSource?.error ? <ActivityError message={dataSource.error} onRetry={dataSource.onRetry}/> : null}
        {!dataSource?.loading && !dataSource?.error && groups.map((group) => <section className="athyper-activity-center__group" key={group.label}>
          <header><strong>{group.label}</strong><span>{group.items.length}</span></header>
          <ul>{group.items.map((item) => <li key={item.id}>{activeTab === "notifications"
            ? <NotificationRow item={item as ShellNotificationItem} onMarkRead={dataSource?.onMarkNotificationRead}/>
            : <InboxRow item={item as ShellInboxItem} onComplete={dataSource?.onCompleteInboxItem}/>}</li>)}</ul>
        </section>)}
        {!dataSource?.loading && !dataSource?.error && !groups.length ? <ActivityEmpty tab={activeTab} filtered={activeTab === "notifications" ? notificationScope === "unread" : inboxScope === "priority"}/> : null}
      </div>

      {fullPageHref ? <footer className="athyper-activity-center__footer"><a href={fullPageHref}>View all {activeTab}<ChevronRightIcon/></a></footer> : null}
    </aside>
  </>, document.body);
}

function PushEnrollmentControl({dataSource}:{readonly dataSource?:ShellActivityDataSource}) {
  const status=dataSource?.pushEnrollmentStatus;
  if(!status||status==="unsupported"||status==="unavailable"||status==="checking")return null;
  if(status==="denied")return <span className="athyper-activity-center__push-status" title="Allow notifications in browser settings to enable alerts">Alerts blocked</span>;
  if(status==="enabled")return <button className="athyper-activity-center__quiet-action" type="button" aria-pressed="true" onClick={()=>void dataSource.onDisableBrowserPush?.()}>Alerts on</button>;
  return <button className="athyper-activity-center__quiet-action" type="button" title={dataSource?.pushEnrollmentError} onClick={()=>void dataSource?.onEnableBrowserPush?.()}>Enable alerts</button>;
}

function ActivityTab({ label, kind, count, active, onSelect }: { readonly label: string; readonly kind: ShellActivityTab; readonly count: number; readonly active: boolean; readonly onSelect: (tab: ShellActivityTab) => void }) {
  return <button id={`athyper-activity-tab-${kind}`} type="button" role="tab" aria-selected={active} aria-controls="athyper-activity-center-content" onClick={() => onSelect(kind)}><span><ActivityGlyph kind={kind}/>{label}</span>{count > 0 ? <b aria-label={`${count} ${kind === "notifications" ? "unread" : "open"}`}>{formatCount(count)}</b> : null}</button>;
}

function FilterButton({ label, count, active, onClick }: { readonly label: string; readonly count: number; readonly active: boolean; readonly onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick}>{label}<span>{formatCount(count)}</span></button>;
}

function NotificationRow({ item, onMarkRead }: { readonly item: ShellNotificationItem; readonly onMarkRead?: (item: ShellNotificationItem) => void | Promise<void> }) {
  const content = <>
    <span className="athyper-activity-center__item-icon" data-tone={item.tone ?? "info"} aria-hidden="true"><NotificationToneGlyph tone={item.tone ?? "info"}/></span>
    <span className="athyper-activity-center__item-copy"><span><strong>{item.title}</strong>{item.unread ? <i role="img" aria-label="Unread"/> : null}</span>{item.detail ? <p>{item.detail}</p> : null}<small>{item.sourceLabel ? `${item.sourceLabel} · ` : null}<time dateTime={item.timestamp}>{item.timestampLabel}</time></small></span>
    <ChevronRightIcon/>
  </>;
  return <article className="athyper-activity-center__item" data-unread={Boolean(item.unread)}>
    {item.href ? <a href={item.href} onClick={() => { if (item.unread) void onMarkRead?.(item); }}>{content}</a> : <div>{content}</div>}
    {item.unread && onMarkRead ? <button className="athyper-activity-center__item-action" type="button" aria-label={`Mark “${item.title}” as read`} title="Mark as read" onClick={() => void onMarkRead(item)}><CheckIcon/></button> : null}
  </article>;
}

function InboxRow({ item, onComplete }: { readonly item: ShellInboxItem; readonly onComplete?: (item: ShellInboxItem) => void | Promise<void> }) {
  const content = <>
    <span className="athyper-activity-center__item-icon" data-priority={item.priority ?? "normal"} aria-hidden="true"><InboxItemGlyph/></span>
    <span className="athyper-activity-center__item-copy"><span><strong>{item.title}</strong>{item.priority && item.priority !== "normal" ? <em data-priority={item.priority}>{item.priority}</em> : null}</span>{item.detail ? <p>{item.detail}</p> : null}{item.sourceLabel || item.assigneeLabel || item.dueLabel ? <small>{[item.sourceLabel, item.assigneeLabel, item.dueLabel].filter(Boolean).join(" · ")}</small> : null}</span>
    <ChevronRightIcon/>
  </>;
  return <article className="athyper-activity-center__item">
    {item.href ? <a href={item.href}>{content}</a> : <div>{content}</div>}
    {onComplete ? <button className="athyper-activity-center__item-action" type="button" aria-label={`Complete “${item.title}”`} title="Mark complete" onClick={() => void onComplete(item)}><CheckIcon/></button> : null}
  </article>;
}

function ActivityEmpty({ tab, filtered }: { readonly tab: ShellActivityTab; readonly filtered: boolean }) {
  const notification = tab === "notifications";
  const title = filtered ? (notification ? "No unread notifications" : "No priority work") : (notification ? "You're all caught up" : "Nothing needs your attention");
  const detail = filtered ? "Switch to All to see the rest of your activity." : notification ? "Approvals, mentions, and important system changes will appear here." : "Assigned tasks, approvals, and conversations will appear here when action is needed.";
  return <div className="athyper-activity-center__empty"><span aria-hidden="true"><ActivityGlyph kind={tab}/><CircleCheckIcon/></span><strong>{title}</strong><p>{detail}</p></div>;
}

function ActivityLoading() { return <div className="athyper-activity-center__loading" role="status"><span className="athyper-visually-hidden">Loading activity</span>{[0, 1, 2, 3].map((item) => <i key={item}/>)}</div>; }
function ActivityError({ message, onRetry }: { readonly message: string; readonly onRetry?: () => void }) { return <div className="athyper-activity-center__error" role="alert"><span aria-hidden="true">!</span><strong>Activity couldn't be loaded</strong><p>{message}</p>{onRetry ? <button type="button" onClick={onRetry}>Try again</button> : null}</div>; }

function groupItems<T extends { readonly groupLabel?: string }>(items: readonly T[]): readonly { readonly label: string; readonly items: readonly T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) { const label = item.groupLabel ?? "Recent"; groups.set(label, [...(groups.get(label) ?? []), item]); }
  return Array.from(groups, ([label, groupedItems]) => ({ label, items: groupedItems }));
}
function formatCount(count: number) { return count > 99 ? "99+" : String(count); }
function ActivityGlyph({ kind }: { readonly kind: ShellActivityTab }) { return kind === "notifications" ? <BellIcon/> : <InboxIcon/>; }
function NotificationToneGlyph({ tone }: { readonly tone: ShellNotificationTone }) { return tone === "critical" || tone === "warning" ? <WarningIcon/> : tone === "success" ? <CircleCheckIcon/> : <InfoIcon/>; }
function InboxItemGlyph() { return <ClipboardCheckIcon/>; }
