"use client";

import { parseInstant } from "@athyper/platform-temporal";
import * as React from "react";
import { ChevronRightIcon, ClockIcon, CloseIcon, ContactRoundIcon, FileTextIcon, HistoryIcon, PanelsTopLeftIcon, SearchIcon, StarIcon } from "@athyper/platform-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DerivedShellNavigation } from "./core";

export type ShellQuickAccessTab = "favourites" | "recent";
export type ShellQuickAccessKind = "record" | "page";

export interface ShellQuickAccessItem {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly description?: string;
  readonly group?: string;
  readonly kind?: ShellQuickAccessKind;
  readonly visitedAt?: string;
}

export interface ShellQuickAccessDataSource {
  readonly favourites?: readonly ShellQuickAccessItem[];
  readonly recent?: readonly ShellQuickAccessItem[];
  readonly onToggleFavourite?: (item: ShellQuickAccessItem, favourite: boolean) => void;
  readonly onDismissRecent?: (item: ShellQuickAccessItem) => void;
  readonly onClearRecent?: () => void;
}

interface QuickAccessStore {
  readonly favourites: readonly ShellQuickAccessItem[];
  readonly recent: readonly ShellQuickAccessItem[];
}

interface ShellQuickAccessProps {
  readonly activeTab: ShellQuickAccessTab;
  readonly tenantId: string;
  readonly accountScope: string;
  readonly path: string;
  readonly navigation: DerivedShellNavigation;
  readonly dataSource?: ShellQuickAccessDataSource;
  readonly onTabChange: (tab: ShellQuickAccessTab) => void;
  readonly onClose: () => void;
}

const EMPTY_STORE: QuickAccessStore = Object.freeze({ favourites: Object.freeze([]), recent: Object.freeze([]) });
const MAX_RECENT_ITEMS = 50;

export function ShellQuickAccess({ activeTab, tenantId, accountScope, path, navigation, dataSource, onTabChange, onClose }: ShellQuickAccessProps) {
  const storageKey = useMemo(() => `athyper.shell.quick-access.v1:${hashScope(`${tenantId}:${accountScope}`)}`, [tenantId, accountScope]);
  const [localStore, setLocalStore] = useState<QuickAccessStore>(EMPTY_STORE);
  const [query, setQuery] = useState("");
  const [recentKind, setRecentKind] = useState<ShellQuickAccessKind>("record");
  const [confirmClear, setConfirmClear] = useState(false);
  const [undoRecent, setUndoRecent] = useState<readonly ShellQuickAccessItem[]>();
  const search = useRef<HTMLInputElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const durableRecords = useDurableRecordFavourites(navigation, dataSource?.favourites !== undefined);

  useEffect(() => {
    const stored = readStore(storageKey);
    const current = dataSource?.recent === undefined ? currentQuickAccessItem(path, navigation) : undefined;
    const next = current ? rememberVisit(stored, current) : stored;
    setLocalStore(next);
    if (current) writeStore(storageKey, next);
  }, [storageKey, path, navigation, dataSource]);

  useEffect(() => {
    requestAnimationFrame(() => search.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const favourites = dataSource?.favourites ?? mergeFavourites(durableRecords.items, localStore.favourites);
  const recent = dataSource?.recent ?? localStore.recent;
  const favouriteHrefs = useMemo(() => new Set(favourites.map((item) => item.href)), [favourites]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingFavourites = useMemo(() => favourites.filter((item) => matchesItem(item, normalizedQuery)), [favourites, normalizedQuery]);
  const recentCounts = useMemo(() => ({
    record: recent.filter((item) => (item.kind ?? "page") === "record").length,
    page: recent.filter((item) => (item.kind ?? "page") === "page").length,
  }), [recent]);
  const matchingRecent = useMemo(() => recent.filter((item) => (item.kind ?? "page") === recentKind && matchesItem(item, normalizedQuery)), [recent, recentKind, normalizedQuery]);
  const favouriteGroups = useMemo(() => groupFavourites(matchingFavourites), [matchingFavourites]);
  const recentGroups = useMemo(() => groupRecent(matchingRecent), [matchingRecent]);
  const favouritesControlled = dataSource?.favourites !== undefined;
  const recentControlled = dataSource?.recent !== undefined;
  const canToggleFavourite = !favouritesControlled || Boolean(dataSource?.onToggleFavourite);
  const canDismissRecent = !recentControlled || Boolean(dataSource?.onDismissRecent);
  const canClearRecent = !recentControlled || Boolean(dataSource?.onClearRecent);

  const toggleFavourite = (item: ShellQuickAccessItem) => {
    const favourite = !favouriteHrefs.has(item.href);
    if (favouritesControlled) {
      dataSource?.onToggleFavourite?.(item, favourite);
      return;
    }
    if (item.id.startsWith("record-bookmark:")) {
      if (!favourite) void durableRecords.remove(item.id);
      return;
    }
    const next = favourite
      ? { ...localStore, favourites: [item, ...localStore.favourites.filter((candidate) => candidate.href !== item.href)] }
      : { ...localStore, favourites: localStore.favourites.filter((candidate) => candidate.href !== item.href) };
    setLocalStore(next);
    writeStore(storageKey, next);
  };

  const dismissRecent = (item: ShellQuickAccessItem) => {
    if (recentControlled) {
      dataSource?.onDismissRecent?.(item);
      return;
    }
    const next = { ...localStore, recent: localStore.recent.filter((candidate) => candidate.href !== item.href) };
    setLocalStore(next);
    writeStore(storageKey, next);
  };

  const clearRecent = () => {
    setConfirmClear(false);
    if (recentControlled) {
      dataSource?.onClearRecent?.();
      return;
    }
    const snapshot = localStore.recent;
    const next = { ...localStore, recent: [] };
    setLocalStore(next);
    writeStore(storageKey, next);
    setUndoRecent(snapshot);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoRecent(undefined), 8_000);
  };

  const restoreRecent = () => {
    if (!undoRecent?.length || recentControlled) return;
    const next = { ...localStore, recent: undoRecent };
    setLocalStore(next);
    writeStore(storageKey, next);
    setUndoRecent(undefined);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

  const visibleCount = activeTab === "favourites" ? matchingFavourites.length : matchingRecent.length;
  const visibleNoun = activeTab === "favourites" ? "favourite" : recentKind;
  const summary = `${visibleCount}${normalizedQuery ? " matching" : ""} ${visibleNoun}${visibleCount === 1 ? "" : "s"}`;
  return <aside id="athyper-quick-access" className="athyper-quick-access" role="dialog" aria-modal="false" aria-labelledby="athyper-quick-access-title">
    <header className="athyper-quick-access__header">
      <span className="athyper-quick-access__hero-icon" aria-hidden="true"><StarIcon data-filled="true" /></span>
      <span>
        <strong id="athyper-quick-access-title">Quick access</strong>
        <small>Your saved and recently opened work</small>
      </span>
      <button type="button" className="athyper-quick-access__close" aria-label="Close quick access" onClick={onClose}><CloseIcon /></button>
    </header>

    <div className="athyper-quick-access__tabs" role="tablist" aria-label="Quick access views">
      <TabButton tab="favourites" activeTab={activeTab} count={favourites.length} onSelect={onTabChange} />
      <TabButton tab="recent" activeTab={activeTab} count={recent.length} onSelect={onTabChange} />
    </div>

    <label className="athyper-quick-access__search">
      <SearchIcon />
      <span className="athyper-visually-hidden">Filter quick access items</span>
      <input ref={search} type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={activeTab === "favourites" ? "Search favourites" : "Search recent work"} maxLength={80} autoComplete="off" />
      {query ? <button type="button" aria-label="Clear filter" onClick={() => setQuery("")}><CloseIcon /></button> : <kbd>/</kbd>}
    </label>

    {activeTab === "recent" ? <div className="athyper-quick-access__scope" aria-label="Recent item type">
      <ScopeButton kind="record" label="Records" count={recentCounts.record} active={recentKind === "record"} onSelect={setRecentKind} />
      <ScopeButton kind="page" label="Pages" count={recentCounts.page} active={recentKind === "page"} onSelect={setRecentKind} />
    </div> : null}

    <div className="athyper-quick-access__summary" aria-live="polite">
      <span>{summary}</span>
      {activeTab === "recent" && recent.length && canClearRecent ? confirmClear
        ? <span className="athyper-quick-access__clear-confirm"><button type="button" onClick={() => setConfirmClear(false)}>Cancel</button><button type="button" onClick={clearRecent}>Clear all</button></span>
        : <button type="button" onClick={() => setConfirmClear(true)}>Clear all recent</button> : null}
    </div>

    <div className="athyper-quick-access__content" id={`quick-access-${activeTab}`} role="tabpanel" aria-labelledby={`quick-access-tab-${activeTab}`}>
      {activeTab === "favourites" && !favouriteGroups.length ? <QuickAccessEmpty variant="favourites" filtered={Boolean(normalizedQuery)} onClearFilter={() => setQuery("")} onShowRecent={() => { setQuery(""); onTabChange("recent"); }} /> : null}
      {activeTab === "recent" && !recentGroups.length ? <QuickAccessEmpty variant="recent" filtered={Boolean(normalizedQuery)} recentKind={recentKind} onClearFilter={() => setQuery("")} onShowPeer={recentCounts[recentKind === "record" ? "page" : "record"] > 0 ? () => setRecentKind(recentKind === "record" ? "page" : "record") : undefined} /> : null}
      {activeTab === "favourites" ? favouriteGroups.map((group) => <QuickAccessGroup key={group.label} label={group.label} items={group.items} favouriteHrefs={favouriteHrefs} onToggleFavourite={canToggleFavourite ? toggleFavourite : undefined} />) : null}
      {activeTab === "recent" ? recentGroups.map((group) => <QuickAccessGroup key={group.label} label={group.label} items={group.items} favouriteHrefs={favouriteHrefs} onToggleFavourite={canToggleFavourite ? toggleFavourite : undefined} onDismiss={canDismissRecent ? dismissRecent : undefined} showTime />) : null}
    </div>
    {undoRecent?.length ? <div className="athyper-quick-access__undo" role="status"><span>Recent history cleared</span><button type="button" onClick={restoreRecent}>Undo</button></div> : null}
  </aside>;
}

interface DurableBookmarkRow { readonly entityCode: string; readonly recordId: string; readonly label?: string; readonly createdAt: string; }
function useDurableRecordFavourites(navigation: DerivedShellNavigation, disabled: boolean): { readonly items: readonly ShellQuickAccessItem[]; remove(id: string): Promise<void> } {
  const [rows, setRows] = useState<readonly DurableBookmarkRow[]>([]);
  const load = React.useCallback(async () => {
    if (disabled) return;
    try {
      const response = await fetch("/api/relay/record-bookmarks", { credentials: "same-origin", headers: { accept: "application/json" }, cache: "no-store" });
      if (!response.ok) return;
      const value = await response.json() as { readonly items?: readonly Readonly<Record<string, unknown>>[] };
      setRows((value.items ?? []).flatMap((item) => typeof item.entityCode === "string" && typeof item.recordId === "string" && typeof item.createdAt === "string" ? [{ entityCode: item.entityCode, recordId: item.recordId, createdAt: item.createdAt, ...(typeof item.label === "string" ? { label: item.label } : {}) }] : []));
    } catch { /* Quick Access keeps local page favourites available offline. */ }
  }, [disabled]);
  useEffect(() => { void load(); const changed = () => void load(); window.addEventListener("athyper:record-bookmarks-changed", changed); return () => window.removeEventListener("athyper:record-bookmarks-changed", changed); }, [load]);
  const items = useMemo(() => rows.map((row): ShellQuickAccessItem => {
    const route = navigation.routes.find((candidate) => candidate.href.endsWith(`/${row.entityCode}`) || candidate.id === row.entityCode);
    const label = row.label ?? row.recordId;
    const href = route ? `${route.href}?q=${encodeURIComponent(label)}` : navigation.landingHref ?? "/";
    return { id: `record-bookmark:${row.entityCode}:${row.recordId}`, href, label, description: route?.label ?? humanize(row.entityCode), group: route?.label ?? humanize(row.entityCode), kind: "record", visitedAt: row.createdAt };
  }), [rows, navigation]);
  const remove = React.useCallback(async (id: string) => {
    const match = /^record-bookmark:([a-z][a-z0-9_.-]{0,126}):([0-9a-f-]{36})$/iu.exec(id);
    if (!match) return;
    const [entityCode, recordId] = [match[1]!, match[2]!];
    const csrf = readCookie("__Host-athyper-csrf") ?? readCookie("athyper-csrf");
    if (!csrf) return;
    const previous = rows; setRows((current) => current.filter((row) => !(row.entityCode === entityCode && row.recordId === recordId)));
    try {
      const response = await fetch(`/api/relay/record-bookmarks/${encodeURIComponent(entityCode)}`, { method: "DELETE", credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json", "x-csrf-token": csrf, "idempotency-key": `quick-access:remove:${crypto.randomUUID()}` }, body: JSON.stringify({ records: [{ id: recordId }] }) });
      if (!response.ok) throw new Error("remove failed");
      window.dispatchEvent(new CustomEvent("athyper:record-bookmarks-changed", { detail: { entityCode, operation: "remove", recordIds: [recordId] } }));
    } catch { setRows(previous); }
  }, [rows]);
  return { items, remove };
}

function mergeFavourites(durable: readonly ShellQuickAccessItem[], local: readonly ShellQuickAccessItem[]): readonly ShellQuickAccessItem[] { const hrefs = new Set(durable.map((item) => item.href)); return [...durable, ...local.filter((item) => !hrefs.has(item.href))]; }
function readCookie(name: string): string | undefined { const prefix = `${name}=`; const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length); if (!value) return undefined; try { return decodeURIComponent(value); } catch { return undefined; } }

function TabButton({ tab, activeTab, count, onSelect }: { readonly tab: ShellQuickAccessTab; readonly activeTab: ShellQuickAccessTab; readonly count: number; readonly onSelect: (tab: ShellQuickAccessTab) => void }) {
  const label = tab === "favourites" ? "Favourites" : "Recent";
  const selectPeer = () => {
    const next: ShellQuickAccessTab = tab === "favourites" ? "recent" : "favourites";
    onSelect(next);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`#quick-access-tab-${next}`)?.focus());
  };
  return <button id={`quick-access-tab-${tab}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`quick-access-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => onSelect(tab)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); selectPeer(); } }}><span>{tab === "favourites" ? <StarIcon /> : <HistoryIcon />}{label}</span><b>{count}</b></button>;
}

function ScopeButton({ kind, label, count, active, onSelect }: { readonly kind: ShellQuickAccessKind; readonly label: string; readonly count: number; readonly active: boolean; readonly onSelect: (kind: ShellQuickAccessKind) => void }) {
  return <button type="button" aria-pressed={active} onClick={() => onSelect(kind)}><span>{label}</span><b>{count}</b></button>;
}

function QuickAccessGroup({ label, items, favouriteHrefs, onToggleFavourite, onDismiss, showTime = false }: { readonly label: string; readonly items: readonly ShellQuickAccessItem[]; readonly favouriteHrefs: ReadonlySet<string>; readonly onToggleFavourite?: (item: ShellQuickAccessItem) => void; readonly onDismiss?: (item: ShellQuickAccessItem) => void; readonly showTime?: boolean }) {
  return <section className="athyper-quick-access__group" aria-labelledby={`quick-group-${slug(label)}`}>
    <header><strong id={`quick-group-${slug(label)}`}>{label}</strong><span>{items.length}</span></header>
    <ul>{items.map((item) => {
      const favourite = favouriteHrefs.has(item.href);
      return <li key={item.id} className="athyper-quick-access__item">
        <span className="athyper-quick-access__item-icon" data-kind={item.kind ?? "page"} aria-hidden="true"><QuickAccessItemIcon item={item}/></span>
        <a href={item.href}>
          <strong>{item.label}</strong>
          <span>{item.description ?? item.group ?? (item.kind === "record" ? "Business record" : "Workspace page")}</span>
          {showTime && item.visitedAt ? <small><ClockIcon />{relativeTime(item.visitedAt)}</small> : null}
        </a>
        {onToggleFavourite || onDismiss ? <span className="athyper-quick-access__item-actions">
          {onToggleFavourite ? <button type="button" aria-label={favourite ? `Remove ${item.label} from favourites` : `Add ${item.label} to favourites`} aria-pressed={favourite} title={favourite ? "Remove from favourites" : "Add to favourites"} onClick={() => onToggleFavourite(item)}><StarIcon data-filled={favourite ? "true" : undefined} /></button> : null}
          {onDismiss ? <button type="button" aria-label={`Remove ${item.label} from recent history`} title="Remove from recent" onClick={() => onDismiss(item)}><CloseIcon /></button> : null}
        </span> : null}
        <ChevronRightIcon />
      </li>;
    })}</ul>
  </section>;
}

function QuickAccessEmpty({ variant, filtered, recentKind, onShowRecent, onShowPeer, onClearFilter }: { readonly variant: ShellQuickAccessTab; readonly filtered: boolean; readonly recentKind?: ShellQuickAccessKind; readonly onShowRecent?: () => void; readonly onShowPeer?: () => void; readonly onClearFilter?: () => void }) {
  const favourites = variant === "favourites";
  const title = filtered ? "No matching items" : favourites ? "Build your working set" : `No recent ${recentKind === "record" ? "records" : "pages"}`;
  const detail = filtered ? "Try another name, code, or workspace." : favourites ? "Star something from Recent to keep important work one click away." : `Open ${recentKind === "record" ? "a business record" : "another workspace page"} and it will appear here automatically.`;
  return <div className="athyper-quick-access__empty">
    <span aria-hidden="true">{favourites ? <StarIcon /> : <HistoryIcon />}</span>
    <strong>{title}</strong>
    <p>{detail}</p>
    {filtered && onClearFilter ? <button type="button" onClick={onClearFilter}>Clear search <ChevronRightIcon /></button> : null}
    {!filtered && favourites && onShowRecent ? <button type="button" onClick={onShowRecent}>Browse recent work <ChevronRightIcon /></button> : null}
    {!filtered && !favourites && onShowPeer ? <button type="button" onClick={onShowPeer}>Show recent {recentKind === "record" ? "pages" : "records"} <ChevronRightIcon /></button> : null}
  </div>;
}

function currentQuickAccessItem(path: string, navigation: DerivedShellNavigation): ShellQuickAccessItem | undefined {
  const route = [...navigation.routes].sort((left, right) => right.href.length - left.href.length).find((candidate) => candidate.href === path || (candidate.href !== "/" && path.startsWith(`${candidate.href}/`)));
  if (!route || path.startsWith("/auth/") || path === "/select-context") return undefined;
  const suffix = path.slice(route.href === "/" ? 1 : route.href.length + 1).split("/").filter(Boolean);
  const last = suffix.at(-1);
  const decoded = last ? safeDecode(last) : undefined;
  const usefulDetail = decoded && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(decoded) ? humanize(decoded) : undefined;
  return {
    id: path,
    href: path,
    label: usefulDetail ?? route.label,
    description: usefulDetail ? `${route.label} · ${route.workspaceName}` : route.workspaceName,
    group: route.label,
    kind: suffix.length ? "record" : "page",
    visitedAt: new Date().toISOString(),
  };
}

function rememberVisit(store: QuickAccessStore, item: ShellQuickAccessItem): QuickAccessStore {
  return { ...store, recent: [item, ...store.recent.filter((candidate) => candidate.href !== item.href)].slice(0, MAX_RECENT_ITEMS) };
}

function groupFavourites(items: readonly ShellQuickAccessItem[]): readonly { readonly label: string; readonly items: readonly ShellQuickAccessItem[] }[] {
  const groups = new Map<string, ShellQuickAccessItem[]>();
  for (const item of items) {
    const label = item.group?.trim() || (item.kind === "record" ? "Records" : "Pages");
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups].map(([label, groupedItems]) => ({ label, items: groupedItems }));
}

function groupRecent(items: readonly ShellQuickAccessItem[]): readonly { readonly label: string; readonly items: readonly ShellQuickAccessItem[] }[] {
  const groups = new Map<string, ShellQuickAccessItem[]>();
  for (const item of items) {
    const label = relativeDay(item.visitedAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return ["Today", "Yesterday", "Previous 7 days", "Older"].flatMap((label) => {
    const groupedItems = groups.get(label);
    return groupedItems?.length ? [{ label, items: groupedItems }] : [];
  });
}

function matchesItem(item: ShellQuickAccessItem, query: string): boolean {
  return !query || [item.label, item.description, item.group, item.href, item.kind].some((value) => value?.toLocaleLowerCase().includes(query));
}

function readStore(key: string): QuickAccessStore {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}") as { favourites?: unknown; recent?: unknown };
    return { favourites: parseItems(value.favourites), recent: parseItems(value.recent).slice(0, MAX_RECENT_ITEMS) };
  } catch {
    localStorage.removeItem(key);
    return EMPTY_STORE;
  }
}

function parseItems(value: unknown): readonly ShellQuickAccessItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    if (typeof item.href !== "string" || !safeLocalHref(item.href) || seen.has(item.href) || typeof item.label !== "string" || !item.label.trim()) return [];
    seen.add(item.href);
    const kind: ShellQuickAccessKind = item.kind === "record" ? "record" : "page";
    return [{
      id: typeof item.id === "string" ? item.id.slice(0, 240) : item.href,
      href: item.href.slice(0, 500),
      label: item.label.trim().slice(0, 120),
      ...(typeof item.description === "string" && item.description.trim() ? { description: item.description.trim().slice(0, 180) } : {}),
      ...(typeof item.group === "string" && item.group.trim() ? { group: item.group.trim().slice(0, 100) } : {}),
      kind,
      ...(typeof item.visitedAt === "string" && !Number.isNaN(parseInstant(item.visitedAt)) ? { visitedAt: item.visitedAt } : {}),
    }];
  });
}

function writeStore(key: string, store: QuickAccessStore) {
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // Private browsing and storage quotas must not interrupt navigation.
  }
}

function relativeDay(value?: string): "Today" | "Yesterday" | "Previous 7 days" | "Older" {
  if (!value) return "Older";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Older";
  const today = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.floor((start - day) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return days <= 7 ? "Previous 7 days" : "Older";
}

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function safeLocalHref(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/(^|\/)\.\.(\/|$)/.test(value);
}

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function humanize(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (character) => character.toUpperCase());
}

function hashScope(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
  return (hash >>> 0).toString(36);
}

function slug(value: string): string { return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "items"; }
function QuickAccessItemIcon({item}:{readonly item:ShellQuickAccessItem}) { if(item.kind!=="record")return <PanelsTopLeftIcon/>;return /business partner/i.test(`${item.label} ${item.description??""} ${item.group??""}`)?<ContactRoundIcon/>:<FileTextIcon/>; }
