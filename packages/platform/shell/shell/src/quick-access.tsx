"use client";

import { FilterChipGroup, SearchField, PanelHeader, PanelContextRow, PanelEmptyState, Button, SettingsMenu, SettingsChoice, SettingsSwitch, PanelRowMenu, Tooltip, readBrowserStorage, removeBrowserStorage, writeBrowserStorage, type PanelHeaderCapabilities } from "@athyper/platform-ui";
import { parseInstant } from "@athyper/platform-temporal";
import * as React from "react";
import { ChevronDownIcon, ChevronRightIcon, ContactRoundIcon, FileTextIcon, HistoryIcon, PanelsTopLeftIcon, SettingsIcon, StarIcon, TrashIcon } from "@athyper/platform-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { admittedEntityPath, admittedEntityRecord, admittedEntityRecordHref, canAccessRoute, entityPlacement, type DerivedShellNavigation } from "./core";
import type { RecordBreadcrumbBinding } from "./route-state";
import { useShellI18n } from "./shell-i18n";
import { WorkspaceToolPanel } from "./workspace-tool-panel";

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
  /** A record's readable business code, shown beside its title (never a technical id). */
  readonly code?: string;
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
  readonly plane?: string;
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

/** Favourites and Recent in the shared right-edge tool panel, with the Notifications
 * anatomy: header (pin, close), scope row, search, section chips with the bulk action,
 * then the shared grouped list. No full view: Quick access has no page of its own. */
export function ShellQuickAccess(props: ShellQuickAccessProps) {
  const t = useShellI18n().message;
  // Density follows the app (Utilities) until the person picks another one here, as in Notifications.
  const [densityOverride, setDensityOverride] = useState<QuickAccessDensity>();
  useEffect(() => { const saved = readBrowserStorage(DENSITY_PREFERENCE); if (isDensity(saved)) setDensityOverride(saved); }, []);
  const density = densityOverride ?? appDensity();
  const changeDensity = (next: QuickAccessDensity) => {
    const override = next === appDensity() ? undefined : next;
    setDensityOverride(override);
    if (override) writeBrowserStorage(DENSITY_PREFERENCE, override); else removeBrowserStorage(DENSITY_PREFERENCE);
  };
  return <WorkspaceToolPanel
    id="quick-access"
    open
    onOpenChange={(open) => { if (!open) props.onClose(); }}
    labels={{ region: t("shell.quick.label"), close: t("shell.quick.close"), pin: t("panel.pin"), unpin: t("panel.unpin"), resize: t("shell.quick.resize") }}
    className="athyper-quick-access"
    panelProps={{ id: "athyper-quick-access", "aria-labelledby": "athyper-quick-access-title", "data-density": density }}
  >
    {(frame) => <QuickAccessContent {...props} visible={frame.visible} capabilities={frame.capabilities} density={density} onDensityChange={changeDensity} />}
  </WorkspaceToolPanel>;
}

function QuickAccessContent({ plane = "shared", activeTab, tenantId, accountScope, path, navigation, dataSource, onTabChange, visible, capabilities, density, onDensityChange }: ShellQuickAccessProps & { readonly visible: boolean; readonly capabilities: PanelHeaderCapabilities; readonly density: QuickAccessDensity; readonly onDensityChange: (density: QuickAccessDensity) => void }) {
  const storageKey = useMemo(() => quickAccessStorageKey(plane, tenantId, accountScope), [plane, tenantId, accountScope]);
  const [localStore, setLocalStore] = useState<QuickAccessStore>(EMPTY_STORE);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const cancelClear = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmClear) cancelClear.current?.focus(); }, [confirmClear]);
  const [undoRecent, setUndoRecent] = useState<readonly ShellQuickAccessItem[]>();
  const search = useRef<HTMLInputElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const durableRecords = useDurableRecordFavourites(navigation, dataSource?.favourites !== undefined);

  useEffect(() => {
    const stored = readStore(storageKey);
    setLocalStore(stored);
  }, [storageKey, path, navigation, dataSource]);

  // The frame owns Escape, modality and focus return; the search is where work starts.
  useEffect(() => {
    if (visible) requestAnimationFrame(() => search.current?.focus());
  }, [visible]);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const favourites = (dataSource?.favourites ?? mergeFavourites(durableRecords.items, localStore.favourites)).filter((item) => canAccessRoute(navigation, item.href.split(/[?#]/)[0]!));
  const recent = (dataSource?.recent ?? localStore.recent).filter((item) => canAccessRoute(navigation, item.href.split(/[?#]/)[0]!));
  const favouriteHrefs = useMemo(() => new Set(favourites.map((item) => item.href)), [favourites]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const [view, setView] = useState<QuickAccessView>(DEFAULT_VIEW);
  useEffect(() => setView(readView()), []);
  const updateView = (change: Partial<QuickAccessView>) => setView((current) => {
    const next = { ...current, ...change };
    writeBrowserStorage(VIEW_PREFERENCE, JSON.stringify(next));
    return next;
  });
  const shown = (item: ShellQuickAccessItem) => view.show === "all" || (item.kind ?? "page") === view.show;
  const matchingFavourites = useMemo(() => favourites.filter((item) => shown(item) && matchesItem(item, normalizedQuery)), [favourites, normalizedQuery, view.show]);
  const matchingRecent = useMemo(() => recent.filter((item) => shown(item) && matchesItem(item, normalizedQuery)), [recent, normalizedQuery, view.show]);
  const favouriteGroups = useMemo(() => groupFavourites(matchingFavourites), [matchingFavourites]);
  const recentGroups = useMemo(() => view.groupBy === "type" ? groupByType(matchingRecent) : groupRecent(matchingRecent), [matchingRecent, view.groupBy]);
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
    // A record bookmark and its Recent visit share the record page; un-starring either removes the bookmark.
    const bookmark = item.id.startsWith("record-bookmark:") ? item : durableRecords.items.find((candidate) => candidate.href === item.href);
    if (bookmark && !favourite) void durableRecords.remove(bookmark.id);
    if (item.id.startsWith("record-bookmark:")) return;
    // Starring a record you can open creates its server bookmark; pages stay browser favourites.
    const record = favourite ? admittedEntityRecord(navigation, item.href) : undefined;
    if (record) { void durableRecords.add(record.entityCode, record.recordId, item.label); return; }
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
    // Clearing follows the Show setting: only the records, or only the pages, when filtered.
    const snapshot = localStore.recent;
    const next = { ...localStore, recent: view.show === "all" ? [] : localStore.recent.filter((item) => (item.kind ?? "page") !== view.show) };
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

  const recentTab = activeTab === "recent";
  const groups = recentTab ? recentGroups : favouriteGroups;
  const kindFiltered = view.show !== "all";
  const shownRecent = kindFiltered ? recent.filter(shown).length : recent.length;
  const shownFavourites = kindFiltered ? favourites.filter(shown).length : favourites.length;
  // A supplied (authoritative) history can only be cleared whole.
  const showClearRecent = recentTab && shownRecent > 0 && canClearRecent && !(kindFiltered && recentControlled);
  const clearLabel = view.show === "record" ? "Clear recent records" : view.show === "page" ? "Clear recent pages" : "Clear all recent";
  // Collapsed groups are remembered per section (and, for Recent, per grouping).
  const groupKey = (label: string) => recentTab ? `recent:${view.groupBy}:${label}` : `favourites:${label}`;
  const collapsed = new Set(view.collapsed);
  const allCollapsed = groups.length > 0 && groups.every((group) => collapsed.has(groupKey(group.label)));
  const toggleGroup = (label: string) => {
    const key = groupKey(label);
    updateView({ collapsed: collapsed.has(key) ? view.collapsed.filter((candidate) => candidate !== key) : [...view.collapsed, key] });
  };
  const collapseAll = (collapse: boolean) => {
    const keys = groups.map((group) => groupKey(group.label));
    updateView({ collapsed: collapse ? [...new Set([...view.collapsed, ...keys])] : view.collapsed.filter((key) => !keys.includes(key)) });
  };
  const of = (count: number, total: number, noun: string) => kindFiltered ? `${count} of ${total} ${noun}` : `${total} ${noun}`;
  return <>
    <PanelHeader icon={<StarIcon/>} title="Quick access" titleId="athyper-quick-access-title" capabilities={capabilities}/>
    <PanelContextRow scope={{ kind: "global", label: "Your saved and recent work", detail: recentTab ? of(shownRecent, recent.length, "recent") : of(shownFavourites, favourites.length, favourites.length === 1 ? "favourite" : "favourites") }}/>
    <div className="athyper-quick-access__search-row">
      <SearchField className="athyper-quick-access__search" ref={search} label="Filter quick access items" value={query} onValueChange={setQuery} clearLabel="Clear filter" placeholder={recentTab ? "Search recent work" : "Search favourites"} maxLength={80} autoComplete="off"/>
      {/* The shared View settings menu (as on record pages); the dot shows settings differ from the defaults. */}
      <SettingsMenu label="View settings" icon={<SettingsIcon aria-hidden="true" />} indicator={view.show !== DEFAULT_VIEW.show || view.groupBy !== DEFAULT_VIEW.groupBy}>
        <SettingsChoice label="Show" value={view.show} options={[{ value: "all", label: "All" }, { value: "record", label: "Records" }, { value: "page", label: "Pages" }]} onValueChange={(show) => { setConfirmClear(false); updateView({ show }); }} />
        {recentTab ? <SettingsChoice label="Group by" value={view.groupBy} options={[{ value: "day", label: "Day" }, { value: "type", label: "Type" }]} onValueChange={(groupBy) => updateView({ groupBy })} /> : null}
        <SettingsChoice label="Density" value={density} options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "spacious", label: "Spacious" }]} onValueChange={onDensityChange} />
        <SettingsSwitch label="Collapse all groups" checked={allCollapsed} disabled={!groups.length} onCheckedChange={collapseAll} />
      </SettingsMenu>
    </div>
    {/* Like All activity | Unread: the section chips, then the section's bulk action. */}
    {/* The shared panel chip row (as in Notifications and Inbox): section chips, then the bulk
        action. Counts live in the scope row above, like "6 notifications" and "0 tasks". */}
    <div className="a-panel-chip-row athyper-quick-access__chips">
      <FilterChipGroup label="Quick access section" value={activeTab} onValueChange={(value) => { setConfirmClear(false); onTabChange(value as ShellQuickAccessTab); }} items={[{ value: "recent", label: "Recent" }, { value: "favourites", label: "Favourites" }]}/>
      {/* Compact like Mark all read: icon and one word; the full action is its name and tooltip.
          Confirming swaps in place, with focus on Cancel so a stray Enter cannot clear history. */}
      {showClearRecent ? <div className="athyper-quick-access__actions">{confirmClear
        ? <><span className="athyper-quick-access__confirm">Clear {shownRecent}?</span><Button ref={cancelClear} size="small" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button><Button size="small" variant="danger" aria-label={`${clearLabel}: ${shownRecent}`} onClick={clearRecent}>Clear</Button></>
        : <Tooltip label={clearLabel} side="bottom" portal><Button size="small" variant="ghost" aria-label={clearLabel} onClick={() => setConfirmClear(true)}><TrashIcon size={16} aria-hidden="true" />Clear</Button></Tooltip>}</div> : null}
    </div>
    <div className="athyper-quick-access__content" aria-live="polite">
      <div role="region" id={`quick-access-${activeTab}`} aria-label={recentTab ? "Recent" : "Favourites"}>
        {groups.length
          ? <div className="a-panel-list">{groups.map((group) => <QuickAccessGroup key={group.label} label={group.label} items={group.items} collapsed={collapsed.has(groupKey(group.label))} onToggle={() => toggleGroup(group.label)} favouriteHrefs={favouriteHrefs} onToggleFavourite={canToggleFavourite ? toggleFavourite : undefined} onDismiss={recentTab && canDismissRecent ? dismissRecent : undefined} showTime={recentTab} />)}</div>
          : <QuickAccessEmpty variant={activeTab} filtered={Boolean(normalizedQuery) || kindFiltered} clearLabel={kindFiltered ? "Show all" : "Clear search"} onClearFilter={() => { setQuery(""); if (kindFiltered) updateView({ show: "all" }); }} onShowRecent={() => { setQuery(""); onTabChange("recent"); }} />}
      </div>
    </div>
    {undoRecent?.length ? <div className="athyper-quick-access__undo" role="status"><span>Recent history cleared</span><button type="button" onClick={restoreRecent}>Undo</button></div> : null}
  </>;
}

interface DurableBookmarkRow { readonly entityCode: string; readonly recordId: string; readonly label?: string; readonly code?: string; readonly createdAt: string; }
function useDurableRecordFavourites(navigation: DerivedShellNavigation, disabled: boolean): { readonly items: readonly ShellQuickAccessItem[]; add(entityCode: string, recordId: string, label: string): Promise<void>; remove(id: string): Promise<void> } {
  const [rows, setRows] = useState<readonly DurableBookmarkRow[]>([]);
  const load = React.useCallback(async () => {
    if (disabled) return;
    try {
      const response = await fetch("/api/relay/record-bookmarks", { credentials: "same-origin", headers: { accept: "application/json" }, cache: "no-store" });
      if (!response.ok) return;
      const value = await response.json() as { readonly items?: readonly Readonly<Record<string, unknown>>[] };
      setRows((value.items ?? []).flatMap((item) => typeof item.entityCode === "string" && typeof item.recordId === "string" && typeof item.createdAt === "string" ? [{ entityCode: item.entityCode, recordId: item.recordId, createdAt: item.createdAt, ...(typeof item.label === "string" ? { label: item.label } : {}), ...(typeof item.code === "string" ? { code: item.code } : {}) }] : []));
    } catch { /* Quick Access keeps local page favourites available offline. */ }
  }, [disabled]);
  useEffect(() => { void load(); const changed = () => void load(); window.addEventListener("athyper:record-bookmarks-changed", changed); return () => window.removeEventListener("athyper:record-bookmarks-changed", changed); }, [load]);
  // A bookmark opens its record page, resolved through the published entity routes (read
  // admission) and the entity's catalog placement; never matched by URL or entity name.
  // Without a read admission it stays hidden (fail closed); without a readable label it is
  // not shown, since technical ids never appear in lists.
  const items = useMemo(() => rows.flatMap((row): ShellQuickAccessItem[] => {
    const href = admittedEntityRecordHref(navigation, row.entityCode, row.recordId);
    const label = row.label?.trim();
    if (!href || !label) return [];
    const placement = entityPlacement(navigation, row.entityCode);
    const code = row.code?.trim() && row.code.trim() !== label ? row.code.trim() : undefined;
    return [{ id: `record-bookmark:${row.entityCode}:${row.recordId}`, href, label, ...(code ? { code } : {}), ...(placement ? { description: `${placement.entityName} · ${placement.route.label}`, group: placement.entityName } : {}), kind: "record", visitedAt: row.createdAt }];
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
  // The same server bookmark the list star creates (PUT, idempotent), so a star follows the
  // person across devices and shows on the list; the change event refreshes both.
  const add = React.useCallback(async (entityCode: string, recordId: string, label: string) => {
    const csrf = readCookie("__Host-athyper-csrf") ?? readCookie("athyper-csrf");
    if (!csrf) return;
    const previous = rows; setRows((current) => [...current.filter((row) => !(row.entityCode === entityCode && row.recordId === recordId)), { entityCode, recordId, label, createdAt: new Date().toISOString() }]);
    try {
      const response = await fetch(`/api/relay/record-bookmarks/${encodeURIComponent(entityCode)}`, { method: "PUT", credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json", "x-csrf-token": csrf, "idempotency-key": `quick-access:add:${crypto.randomUUID()}` }, body: JSON.stringify({ records: [{ id: recordId, label }] }) });
      if (!response.ok) throw new Error("add failed");
      window.dispatchEvent(new CustomEvent("athyper:record-bookmarks-changed", { detail: { entityCode, operation: "add", recordIds: [recordId] } }));
    } catch { setRows(previous); }
  }, [rows]);
  return { items, add, remove };
}

function mergeFavourites(durable: readonly ShellQuickAccessItem[], local: readonly ShellQuickAccessItem[]): readonly ShellQuickAccessItem[] { const hrefs = new Set(durable.map((item) => item.href)); return [...durable, ...local.filter((item) => !hrefs.has(item.href))]; }
function readCookie(name: string): string | undefined { const prefix = `${name}=`; const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length); if (!value) return undefined; try { return decodeURIComponent(value); } catch { return undefined; } }

function QuickAccessGroup({ label, items, collapsed, onToggle, favouriteHrefs, onToggleFavourite, onDismiss, showTime = false }: { readonly label: string; readonly items: readonly ShellQuickAccessItem[]; readonly collapsed: boolean; readonly onToggle: () => void; readonly favouriteHrefs: ReadonlySet<string>; readonly onToggleFavourite?: (item: ShellQuickAccessItem) => void; readonly onDismiss?: (item: ShellQuickAccessItem) => void; readonly showTime?: boolean }) {
  const headingId = `quick-group-${slug(label)}`, listId = `${headingId}-items`;
  return <section className="a-panel-list__group" aria-labelledby={headingId}>
    <header><button type="button" className="a-panel-list__toggle" aria-expanded={!collapsed} aria-controls={listId} onClick={onToggle}><ChevronDownIcon aria-hidden="true" /><strong id={headingId}>{label}</strong><span>{items.length}</span></button></header>
    <ul id={listId} hidden={collapsed}>{items.map((item) => {
      const favourite = favouriteHrefs.has(item.href);
      // One identity in every list and density: the title, then code · entity · module.
      const meta = [item.code, item.description ?? item.group ?? (item.kind === "record" ? "Business record" : "Workspace page")].filter(Boolean).join(" · ");
      return <li key={item.id}>
        <article className="a-panel-row athyper-quick-access__row">
          <span className="a-panel-row__icon" data-kind={item.kind ?? "page"} aria-hidden="true"><QuickAccessItemIcon item={item}/></span>
          <div className="a-panel-row__copy">
            <div className="a-panel-row__heading">
              {/* The title is the row's link; star and ⋯ sit above it. */}
              <strong dir="auto"><a href={item.href} title={`${item.label} · ${meta}`}>{item.label}</a></strong>
              {showTime && item.visitedAt ? <time dateTime={item.visitedAt}>{relativeTime(item.visitedAt)}</time> : null}
            </div>
            <p dir="auto">{meta}</p>
          </div>
          {onToggleFavourite || onDismiss ? <div className="a-panel-row__actions">
            {onToggleFavourite ? <button type="button" className="a-panel-row__action" aria-label={favourite ? `Remove ${item.label} from favourites` : `Add ${item.label} to favourites`} aria-pressed={favourite} title={favourite ? "Remove from favourites" : "Add to favourites"} onClick={() => onToggleFavourite(item)}><StarIcon size={16} data-filled={favourite ? "true" : undefined} /></button> : null}
            {onDismiss ? <PanelRowMenu label={`Actions for ${item.label}`}>
              <Button variant="ghost" aria-label={`Remove ${item.label} from recent history`} onClick={() => onDismiss(item)}>Remove from recent</Button>
            </PanelRowMenu> : null}
          </div> : null}
        </article>
      </li>;
    })}</ul>
  </section>;
}

function QuickAccessEmpty({ variant, filtered, clearLabel = "Clear search", onShowRecent, onClearFilter }: { readonly variant: ShellQuickAccessTab; readonly filtered: boolean; readonly clearLabel?: string; readonly onShowRecent?: () => void; readonly onClearFilter?: () => void }) {
  const favourites = variant === "favourites";
  const title = filtered ? (favourites ? "No matching favourites" : "No matching recent items") : favourites ? "No favourites yet" : "No recent work";
  const detail = filtered ? "Try another name, code, or workspace, or show all items." : favourites ? "Star an item in Recent to keep it here." : "Open a business record or workspace page and it will appear here automatically.";
  return <PanelEmptyState className="athyper-quick-access__empty" icon={favourites ? <StarIcon/> : <HistoryIcon/>} title={title} description={detail} action={<>
    {filtered && onClearFilter ? <Button variant="secondary" type="button" onClick={onClearFilter}>{clearLabel}</Button> : null}
    {!filtered && favourites && onShowRecent ? <Button variant="secondary" type="button" onClick={onShowRecent}>Browse recent work <ChevronRightIcon /></Button> : null}
  </>}/>;
}

/** Recent visits for one plane, tenant and account (browser-local, newest first). */
export function readQuickAccessRecent(plane: string, tenantId: string, accountScope: string): readonly ShellQuickAccessItem[] {
  return readStore(quickAccessStorageKey(plane, tenantId, accountScope)).recent;
}

export function quickAccessStorageKey(plane: string, tenantId: string, accountScope: string): string {
  return `athyper.shell.quick-access.v2:${hashScope(JSON.stringify([plane, tenantId, accountScope]))}`;
}

/**
 * Record authorized route visits independently of whether Quick Access is open. resolvedRecord is the
 * same binding useRecordBreadcrumb already registers for breadcrumbs — reused here so a record page's
 * actual resolved title (not a humanized/opaque URL segment) reaches Recent, without requiring pages to
 * register their identity a second time through a separate mechanism.
 */
export function useRememberQuickAccessVisit(plane: string, tenantId: string, accountScope: string, path: string, navigation: DerivedShellNavigation, enabled: boolean, resolvedRecord?: RecordBreadcrumbBinding) {
  const previous = useRef<string | undefined>(undefined);
  const key = quickAccessStorageKey(plane, tenantId, accountScope);
  const pathname = path.split(/[?#]/)[0]!;
  const resolved = resolvedRecord?.pathname === pathname ? resolvedRecord : undefined;
  const resolvedLabel = resolved?.title ?? resolved?.label, resolvedCode = resolved?.code;
  useEffect(() => {
    if (!enabled || !canAccessRoute(navigation, pathname)) return;
    const item = currentQuickAccessItem(pathname, navigation, resolvedLabel, resolvedCode);
    if (!item) return;
    // A record's title and code can resolve after the visit; the later identity replaces the entry.
    const visit = `${key}:${pathname}:${item.label}:${item.code ?? ""}`;
    if (previous.current === visit) return;
    previous.current = visit;
    writeStore(key, rememberVisit(readStore(key), item));
  }, [key, pathname, navigation, enabled, resolvedLabel, resolvedCode]);
}

function currentQuickAccessItem(path: string, navigation: DerivedShellNavigation, resolvedLabel?: string, resolvedCode?: string): ShellQuickAccessItem | undefined {
  // Entity pages are published entity routes, not plane menu routes: resolve them through
  // their admission and catalog placement. A record waits for its resolved title; a list
  // takes the entity's catalog name; neither is ever remembered under a technical id.
  const entity = admittedEntityPath(navigation, path);
  if (entity) {
    const placement = entityPlacement(navigation, entity.entityCode);
    const label = entity.recordId ? resolvedLabel?.trim() : placement?.entityName;
    if (!label) return undefined;
    const code = entity.recordId && resolvedCode?.trim() && resolvedCode.trim() !== label ? resolvedCode.trim() : undefined;
    return {
      id: path,
      href: path,
      label,
      ...(code ? { code } : {}),
      ...(entity.recordId
        ? (placement ? { description: `${placement.entityName} · ${placement.route.label}`, group: placement.entityName } : {})
        : (placement ? { description: `${placement.route.label} · ${placement.route.workspaceName}`, group: placement.route.label } : {})),
      kind: entity.recordId ? "record" : "page",
      visitedAt: new Date().toISOString(),
    };
  }
  const route = [...navigation.routes].sort((left, right) => right.href.length - left.href.length).find((candidate) => candidate.href === path || (candidate.href !== "/" && path.startsWith(`${candidate.href}/`)));
  if (!route || path.startsWith("/auth/") || path === "/select-context") return undefined;
  const suffix = path.slice(route.href === "/" ? 1 : route.href.length + 1).split("/").filter(Boolean);
  const last = suffix.at(-1);
  const decoded = last ? safeDecode(last) : undefined;
  const usefulDetail = resolvedLabel ?? (decoded && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(decoded) ? humanize(decoded) : undefined);
  // A record known only by an opaque id waits for its resolved title; it is never
  // remembered under the module's name.
  if (suffix.length && !usefulDetail) return undefined;
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

/** Group by what the item is: records under their entity (People, Countries), then pages. */
function groupByType(items: readonly ShellQuickAccessItem[]): readonly { readonly label: string; readonly items: readonly ShellQuickAccessItem[] }[] {
  const records = new Map<string, ShellQuickAccessItem[]>(), pages: ShellQuickAccessItem[] = [];
  for (const item of items) {
    if ((item.kind ?? "page") !== "record") { pages.push(item); continue; }
    const label = item.group?.trim() || "Records";
    records.set(label, [...(records.get(label) ?? []), item]);
  }
  return [...[...records].map(([label, grouped]) => ({ label, items: grouped })), ...(pages.length ? [{ label: "Pages", items: pages }] : [])];
}

type QuickAccessDensity = "compact" | "comfortable" | "spacious";
const DENSITY_PREFERENCE = "athyper.shell.quick-access.density";
const isDensity = (value: unknown): value is QuickAccessDensity => value === "compact" || value === "comfortable" || value === "spacious";
/** The app density chosen in Utilities (on the document root); comfortable when unset. */
function appDensity(): QuickAccessDensity {
  const value = typeof document === "undefined" ? undefined : document.documentElement.dataset.density;
  return isDensity(value) ? value : "comfortable";
}

type QuickAccessShow = "all" | ShellQuickAccessKind;
interface QuickAccessView { readonly show: QuickAccessShow; readonly groupBy: "day" | "type"; readonly collapsed: readonly string[] }
// v2: Records became the default Show; earlier saved views start again from the new defaults.
const VIEW_PREFERENCE = "athyper.shell.quick-access.view.v2";
/** Records first (what people return to), grouped by day, groups open; density follows the app. */
const DEFAULT_VIEW: QuickAccessView = Object.freeze({ show: "record", groupBy: "day", collapsed: Object.freeze([]) });
/** View settings are a per-browser convenience; anything unreadable falls back to the defaults. */
function readView(): QuickAccessView {
  try {
    const value = JSON.parse(readBrowserStorage(VIEW_PREFERENCE) ?? "{}") as Record<string, unknown>;
    return {
      show: value.show === "all" || value.show === "record" || value.show === "page" ? value.show : DEFAULT_VIEW.show,
      groupBy: value.groupBy === "type" ? "type" : "day",
      collapsed: Array.isArray(value.collapsed) ? value.collapsed.filter((key): key is string => typeof key === "string").slice(0, 100) : [],
    };
  } catch { return DEFAULT_VIEW; }
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
    try { localStorage.removeItem(key); } catch { /* Storage access itself can be denied. */ }
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
      ...(typeof item.code === "string" && item.code.trim() ? { code: item.code.trim().slice(0, 120) } : {}),
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
