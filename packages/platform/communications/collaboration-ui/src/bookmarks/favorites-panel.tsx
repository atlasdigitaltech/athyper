"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Search,
  Star,
  X,
} from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@athyper/platform-ui/primitives";
import { appEntityDetailHref, entityCodeFromRouteSegment } from "@athyper/runtime-shared/core";

export type FavoritesPanelTab = "bookmarks" | "recent";
type RecentScope = "records" | "other";

export interface FavoriteBookmarkItem {
  id: string;
  entityCode: string;
  recordId: string;
  displayName: string | null;
  recordCode: string | null;
  createdAt: string;
}

export interface FavoriteBookmarkGroup {
  entityCode: string;
  count: number;
  items: FavoriteBookmarkItem[];
}

export interface FavoriteRecentItem {
  href: string;
  label: string;
  refCode?: string;
  entityCode?: string;
  entityLabel?: string;
  recordCode?: string;
  recordName?: string;
  moduleCode?: string;
  recordFamily?: string;
  visitedAt: string;
  pinned?: boolean;
}

interface RecentRecordMeta {
  entityLabel: string;
  recordCode: string;
  recordName?: string;
}

export interface FavoritesPanelProps {
  activeTab?: FavoritesPanelTab;
  defaultTab?: FavoritesPanelTab;
  onTabChange?: (tab: FavoritesPanelTab) => void;
  onClose?: () => void;
  bookmarks?: FavoriteBookmarkGroup[];
  bookmarksLoading?: boolean;
  bookmarksError?: unknown;
  recentItems?: FavoriteRecentItem[];
  onNavigate?: (href: string) => void;
  onRemoveBookmark?: (item: FavoriteBookmarkItem) => void;
  bookmarkActionPending?: boolean;
  onDismissRecent?: (href: string) => void;
  bookmarkHref?: (item: FavoriteBookmarkItem) => string;
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function defaultBookmarkHref(item: FavoriteBookmarkItem): string {
  const navId = item.recordCode?.trim() || item.recordId;
  return appEntityDetailHref(item.entityCode, navId);
}

function matchesBookmark(item: FavoriteBookmarkItem, entityLabel: string, filter: string): boolean {
  if (!filter) return true;
  return [
    entityLabel,
    item.entityCode,
    item.displayName ?? "",
    item.recordCode ?? "",
    item.recordId,
  ].some((value) => value.toLowerCase().includes(filter));
}

function matchesRecent(item: FavoriteRecentItem, filter: string): boolean {
  if (!filter) return true;
  const recordMeta = recentRecordMeta(item);
  return [
    item.label,
    item.refCode ?? "",
    item.entityCode ?? "",
    item.entityLabel ?? "",
    item.recordCode ?? "",
    item.recordName ?? "",
    recordMeta?.entityLabel ?? "",
    recordMeta?.recordCode ?? "",
    recordMeta?.recordName ?? "",
    item.moduleCode ?? "",
    item.recordFamily ?? "",
    item.href,
  ].some((value) => value.toLowerCase().includes(filter));
}

function recentGroupLabel(visitedAt: string): "Today" | "Yesterday" | "Earlier" {
  const visited = new Date(visitedAt);
  if (Number.isNaN(visited.getTime())) return "Earlier";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(visited.getFullYear(), visited.getMonth(), visited.getDate()).getTime();
  const diffDays = Math.round((today - day) / 86_400_000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Earlier";
}

function meaningfulRecordName(item: FavoriteRecentItem, recordCode: string): string | undefined {
  const recordName = item.recordName?.trim();
  if (!recordName || recordName.toLowerCase() === recordCode.toLowerCase()) return undefined;
  return recordName;
}

function recentRecordMeta(item: FavoriteRecentItem): RecentRecordMeta | null {
  if (item.entityLabel && item.recordCode) {
    return {
      entityLabel: item.entityLabel,
      recordCode: item.recordCode,
      recordName: meaningfulRecordName(item, item.recordCode),
    };
  }

  const match = item.href.match(/^\/app\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  const entityCode = entityCodeFromRouteSegment(safeDecode(match[1]!));
  const recordCode = safeDecode(match[2]!);
  if (!entityCode || !recordCode || recordCode === "new") return null;

  return {
    entityLabel: humanize(entityCode),
    recordCode,
    recordName: meaningfulRecordName(item, recordCode),
  };
}

function isRecentRecord(item: FavoriteRecentItem): boolean {
  return recentRecordMeta(item) !== null;
}

function recentTitle(item: FavoriteRecentItem): string {
  const recordMeta = recentRecordMeta(item);
  return recordMeta ? recordMeta.entityLabel : item.label;
}

function recentSubtitle(item: FavoriteRecentItem): string {
  const recordMeta = recentRecordMeta(item);
  return recordMeta ? recordMeta.recordCode : item.refCode ?? item.href;
}

function recentTertiary(item: FavoriteRecentItem): string | undefined {
  return recentRecordMeta(item)?.recordName;
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex h-7 items-center justify-between px-3">
      <span className="truncate">{label}</span>
      <span className="ml-2 rounded-full border bg-muted/40 px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground/70">
        {count}
      </span>
    </div>
  );
}

function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div className="flex h-full min-h-52 flex-col items-center justify-center px-6 text-center">
      <Star className="h-7 w-7 text-muted-foreground/40" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2 px-3 py-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-11 animate-pulse rounded-md border bg-muted/30" />
      ))}
    </div>
  );
}

function ItemShell({
  title,
  subtitle,
  tertiary,
  onNavigate,
  action,
}: {
  title: string;
  subtitle?: string;
  tertiary?: string;
  onNavigate: () => void;
  action?: ReactNode;
}) {
  return (
    <div className={cn(
      "group flex items-center rounded-md border bg-card/70 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-accent/40",
      tertiary ? "min-h-14" : "min-h-11",
    )}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onNavigate}
            className={cn(
              "grid min-w-0 flex-1 items-center gap-2 px-2 text-left",
              tertiary ? "py-2" : "py-1.5",
              "grid-cols-[minmax(0,1fr)_auto]",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {title}
              </span>
              {subtitle && (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {subtitle}
                </span>
              )}
              {tertiary && (
                <span className="block truncate text-xs text-muted-foreground/80">
                  {tertiary}
                </span>
              )}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-60 space-y-0.5">
          <p className="font-medium text-popover-foreground">{title}</p>
          {subtitle && (
            <p className="text-popover-foreground/70">{subtitle}</p>
          )}
          {tertiary && (
            <p className="text-popover-foreground/60">{tertiary}</p>
          )}
        </TooltipContent>
      </Tooltip>
      {action}
    </div>
  );
}

export function FavoritesPanel({
  activeTab,
  defaultTab = "bookmarks",
  onTabChange,
  onClose,
  bookmarks = [],
  bookmarksLoading = false,
  bookmarksError,
  recentItems = [],
  onNavigate,
  onRemoveBookmark,
  bookmarkActionPending = false,
  onDismissRecent,
  bookmarkHref = defaultBookmarkHref,
}: FavoritesPanelProps) {
  const [localTab, setLocalTab] = useState<FavoritesPanelTab>(defaultTab);
  const [recentScope, setRecentScope] = useState<RecentScope>("records");
  const [filter, setFilter] = useState("");
  const tab = activeTab ?? localTab;
  const normalizedFilter = filter.trim().toLowerCase();

  const setTab = (next: FavoritesPanelTab) => {
    setLocalTab(next);
    onTabChange?.(next);
  };

  const navigate = (href: string) => {
    if (onNavigate) {
      onNavigate(href);
      return;
    }
    window.location.href = href;
  };

  const visibleBookmarkGroups = useMemo(() => {
    return bookmarks
      .map((group) => {
        const label = humanize(group.entityCode);
        const items = group.items.filter((item) =>
          matchesBookmark(item, label, normalizedFilter),
        );
        return { ...group, label, items, count: items.length };
      })
      .filter((group) => group.items.length > 0);
  }, [bookmarks, normalizedFilter]);

  const recentCounts = useMemo(() => {
    let records = 0;
    let other = 0;
    for (const item of recentItems) {
      if (isRecentRecord(item)) records += 1;
      else other += 1;
    }
    return { records, other };
  }, [recentItems]);

  const recentGroups = useMemo(() => {
    const buckets: Record<"Today" | "Yesterday" | "Earlier", FavoriteRecentItem[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    for (const item of recentItems) {
      const itemScope: RecentScope = isRecentRecord(item) ? "records" : "other";
      if (itemScope !== recentScope) continue;
      if (!matchesRecent(item, normalizedFilter)) continue;
      buckets[recentGroupLabel(item.visitedAt)].push(item);
    }

    return (["Today", "Yesterday", "Earlier"] as const)
      .map((label) => ({ label, items: buckets[label] }))
      .filter((group) => group.items.length > 0);
  }, [recentItems, recentScope, normalizedFilter]);

  return (
    <TooltipProvider delayDuration={500}>
    <div className="flex h-full flex-col overflow-hidden bg-background text-sm">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <Star className="h-4 w-4 shrink-0 fill-current text-primary" />
          <p className="truncate text-sm font-semibold text-foreground">Favourites</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3">
        {(["bookmarks", "recent"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={cn(
              "h-6 rounded-full px-2.5 text-xs font-medium transition-colors",
              tab === option
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option === "bookmarks" ? "Bookmarks" : "Recent"}
          </button>
        ))}
      </div>

      <div className="flex h-9 shrink-0 items-center border-b px-3">
        <div className="flex h-7 w-full items-center gap-2 rounded-md border bg-muted/30 px-2.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter items..."
            maxLength={80}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {tab === "recent" && (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3">
          {([
            ["records", "Records", recentCounts.records],
            ["other", "Other", recentCounts.other],
          ] as const).map(([scope, label, count]) => (
            <button
              key={scope}
              type="button"
              onClick={() => setRecentScope(scope)}
              className={cn(
                "flex h-6 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
                recentScope === scope
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span>{label}</span>
              <span className="rounded-full bg-background/80 px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {tab === "bookmarks" && bookmarksLoading ? (
          <LoadingRows />
        ) : tab === "bookmarks" && bookmarksError ? (
          <EmptyState
            title="Bookmarks unavailable"
            hint="Refresh the panel to try loading them again."
          />
        ) : tab === "bookmarks" && visibleBookmarkGroups.length === 0 ? (
          <EmptyState
            title="No bookmarks yet"
            hint={"Use \u2605 on any record row to save it here."}
          />
        ) : tab === "bookmarks" ? (
          <div className="space-y-2">
            {visibleBookmarkGroups.map((group) => (
              <section key={group.entityCode}>
                <GroupHeader label={group.label} count={group.count} />
                <div className="space-y-1 px-2">
                  {group.items.map((item) => {
                    const code = item.recordCode?.trim() || item.recordId.slice(0, 8);
                    const name = item.displayName?.trim();
                    const recordName = name && name.toLowerCase() !== code.toLowerCase()
                      ? name
                      : undefined;
                    const actionLabel = recordName ?? code;
                    return (
                      <ItemShell
                        key={item.id}
                        title={code}
                        subtitle={recordName}
                        tertiary={group.label}
                        onNavigate={() => navigate(bookmarkHref(item))}
                        action={
                          <button
                            type="button"
                            onClick={() => onRemoveBookmark?.(item)}
                            disabled={bookmarkActionPending}
                            aria-label={`Remove ${actionLabel} from favourites`}
                            title="Remove from favourites"
                            className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Star className="h-3.5 w-3.5 fill-current" />
                          </button>
                        }
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : recentGroups.length === 0 ? (
          <EmptyState
            title={recentScope === "records" ? "No recent records" : "No other recent items"}
            hint={
              recentScope === "records"
                ? "Recently opened business records will appear here."
                : "Recently opened pages, workspaces, and settings will appear here."
            }
          />
        ) : (
          <div className="space-y-2">
            {recentGroups.map((group) => (
              <section key={group.label}>
                <GroupHeader label={group.label} count={group.items.length} />
                <div className="space-y-1 px-2">
                  {group.items.map((item) => (
                    <ItemShell
                      key={item.href}
                      title={recentSubtitle(item)}
                      subtitle={recentTertiary(item)}
                      tertiary={recentTitle(item)}
                      onNavigate={() => navigate(item.href)}
                      action={
                        <button
                          type="button"
                          onClick={() => onDismissRecent?.(item.href)}
                          aria-label={`Dismiss ${item.label} from recent items`}
                          title="Dismiss from recent"
                          className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}
