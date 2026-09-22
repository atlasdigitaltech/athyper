"use client";

import { BellIcon, CheckIcon, ChevronRightIcon, CircleCheckIcon, ClipboardCheckIcon, InboxIcon, InfoIcon, WarningIcon } from "@athyper/platform-icons";
import { activityCount } from "./activity-counts";
import { Drawer, FilterChipGroup, PanelTabs, PanelEmptyState, Button } from "@athyper/platform-ui";
import * as React from "react";
import { useState } from "react";

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
  readonly errorStatus?: number;
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
  const countsReady = Boolean(dataSource && !dataSource.loading && !dataSource.error);
  const notifications = dataSource?.notifications ?? [];
  const inbox = dataSource?.inbox ?? [];
  const [notificationScope, setNotificationScope] = useState<"all" | "unread">("all");
  const [inboxScope, setInboxScope] = useState<"all" | "priority">("all");
  const unreadCount = activityCount(dataSource, "notifications");
  const priorityCount = inbox.filter((item) => item.priority === "high" || item.priority === "urgent").length;
  const visibleNotifications = notificationScope === "unread" ? notifications.filter((item) => item.unread) : notifications;
  const visibleInbox = inboxScope === "priority" ? inbox.filter((item) => item.priority === "high" || item.priority === "urgent") : inbox;
  const groups = activeTab === "notifications"
    ? groupItems(visibleNotifications)
    : groupItems(visibleInbox);
  const fullPageHref = activeTab === "notifications" ? dataSource?.notificationsHref : dataSource?.inboxHref;
  const accessDenied = dataSource?.errorStatus === 403 || (!dataSource?.errorStatus && /\b403\b|forbidden/i.test(dataSource?.error ?? ""));
  const content = <>{dataSource?.loading ? <ActivityLoading/> : null}
    {!dataSource?.loading && dataSource?.error ? <ActivityError tab={activeTab} accessDenied={accessDenied} onRetry={dataSource.onRetry}/> : null}
    {!dataSource?.loading && !dataSource?.error && groups.map((group) => <section className="athyper-activity-center__group" key={group.label}>
      <header><strong>{group.label}</strong><span>{group.items.length}</span></header>
      <ul>{group.items.map((item) => <li key={item.id}>{activeTab === "notifications"
        ? <NotificationRow item={item as ShellNotificationItem} onMarkRead={dataSource?.onMarkNotificationRead}/>
        : <InboxRow item={item as ShellInboxItem} onComplete={dataSource?.onCompleteInboxItem}/>}</li>)}</ul>
    </section>)}
    {!dataSource?.loading && !dataSource?.error && !groups.length ? <ActivityEmpty onShowAll={()=>activeTab === "notifications" ? setNotificationScope("all") : setInboxScope("all")} tab={activeTab} filtered={activeTab === "notifications" ? notificationScope === "unread" : inboxScope === "priority"}/> : null}</>;

  return <Drawer.Root open onOpenChange={(open) => { if (!open) onClose(); }}><Drawer.Panel id="athyper-activity-center" size="standard" variant="activity" mobilePresentation="fullscreen" className="athyper-activity-center">
    <Drawer.Header appearance="panel" icon={<ActivityGlyph kind={activeTab}/>} title="Activity center" description="Updates and work that need your attention" closeLabel="Close activity center"/>
    <PanelTabs label="Activity type" value={activeTab} onValueChange={value=>onTabChange(value as ShellActivityTab)} items={(["notifications","inbox"] as const).map(key=>{const count=activityCount(dataSource,key),label=key==="notifications"?"Notifications":"Inbox";return {key,label,count,id:`athyper-activity-tab-${key}`,panelId:`athyper-activity-content-${key}`,accessibleLabel:`${label}${count===undefined?", count unavailable":`, ${count}`}`};})}/>
      <Drawer.Toolbar className="athyper-activity-center__toolbar">
        <FilterChipGroup label={activeTab === "notifications" ? "Notification filters" : "Inbox filters"} value={activeTab === "notifications" ? notificationScope : inboxScope} onValueChange={value=>activeTab === "notifications" ? setNotificationScope(value as "all"|"unread") : setInboxScope(value as "all"|"priority")} items={activeTab === "notifications" ? [{value:"all",label:"All",count:countsReady?notifications.length:undefined},{value:"unread",label:"Unread",count:unreadCount}] : [{value:"all",label:"All",count:countsReady?inbox.length:undefined},{value:"priority",label:"Priority",count:countsReady?priorityCount:undefined}]}/>
        {activeTab === "notifications" ? <div className="athyper-activity-center__toolbar-actions">
          {unreadCount !== undefined && unreadCount > 0 && dataSource?.onMarkAllNotificationsRead ? <button className="athyper-activity-center__quiet-action" type="button" onClick={() => void dataSource.onMarkAllNotificationsRead?.()}>Mark all read</button> : null}
          <PushEnrollmentControl dataSource={dataSource}/>
        </div> : null}
      </Drawer.Toolbar>
      <Drawer.Body className="athyper-activity-center__content" aria-live="polite"><div role="tabpanel" id={`athyper-activity-content-${activeTab}`} aria-labelledby={`athyper-activity-tab-${activeTab}`}>{content}</div></Drawer.Body>
      {fullPageHref && !dataSource?.error ? <Drawer.Footer className="athyper-activity-center__footer"><a href={fullPageHref}>View all {activeTab}<ChevronRightIcon/></a></Drawer.Footer> : null}
  </Drawer.Panel></Drawer.Root>;
}

function PushEnrollmentControl({dataSource}:{readonly dataSource?:ShellActivityDataSource}) {
  const status=dataSource?.pushEnrollmentStatus;
  if(!status||status==="unsupported"||status==="unavailable"||status==="checking")return null;
  if(status==="denied")return <span className="athyper-activity-center__push-status" title="Allow notifications in browser settings to enable alerts">Alerts blocked</span>;
  if(status==="enabled")return <button className="athyper-activity-center__quiet-action" type="button" aria-pressed="true" onClick={()=>void dataSource.onDisableBrowserPush?.()}>Alerts on</button>;
  return <button className="athyper-activity-center__quiet-action" type="button" title={dataSource?.pushEnrollmentError} onClick={()=>void dataSource?.onEnableBrowserPush?.()}>Enable alerts</button>;
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

function ActivityEmpty({ tab, filtered, onShowAll }: { readonly tab: ShellActivityTab; readonly filtered: boolean; readonly onShowAll:()=>void }) {
  const notification = tab === "notifications";
  const title = filtered ? (notification ? "No unread notifications" : "No priority work") : (notification ? "You’re all caught up" : "Your inbox is empty");
  const detail = filtered ? "Show all to see the rest of your activity." : notification ? "New notifications will appear here." : "Work assigned to you will appear here.";
  return <PanelEmptyState icon={<ActivityGlyph kind={tab}/>} title={title} description={detail} action={filtered?<Button variant="secondary" onClick={onShowAll}>Show all</Button>:undefined}/>;
}

function ActivityLoading() { return <div className="athyper-activity-center__loading" role="status"><span className="athyper-visually-hidden">Loading activity</span>{[0, 1, 2, 3].map((item) => <i key={item}/>)}</div>; }
function ActivityError({ tab, accessDenied, onRetry }: { readonly tab:ShellActivityTab; readonly accessDenied:boolean; readonly onRetry?: () => void }) {
  return <PanelEmptyState tone="error" role="alert" icon={accessDenied?<InfoIcon/>:<WarningIcon/>} title={accessDenied ? "Activity isn’t available for this account" : `Couldn’t load ${tab === "notifications" ? "notifications" : "your inbox"}`} description={accessDenied ? "Contact your administrator if you need access." : "Please try again."} action={!accessDenied && onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button>:undefined}/>;
}

function groupItems<T extends { readonly groupLabel?: string }>(items: readonly T[]): readonly { readonly label: string; readonly items: readonly T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) { const label = item.groupLabel ?? "Recent"; groups.set(label, [...(groups.get(label) ?? []), item]); }
  return Array.from(groups, ([label, groupedItems]) => ({ label, items: groupedItems }));
}
function ActivityGlyph({ kind }: { readonly kind: ShellActivityTab }) { return kind === "notifications" ? <BellIcon/> : <InboxIcon/>; }
function NotificationToneGlyph({ tone }: { readonly tone: ShellNotificationTone }) { return tone === "critical" || tone === "warning" ? <WarningIcon/> : tone === "success" ? <CircleCheckIcon/> : <InfoIcon/>; }
function InboxItemGlyph() { return <ClipboardCheckIcon/>; }
