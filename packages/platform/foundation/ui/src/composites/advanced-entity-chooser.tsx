"use client";

/**
 * AdvancedEntityChooserPanel â€” high-density, configurable entity picker panel.
 *
 * Features:
 *   - 4 density modes: mini / compact / comfortable / mobile
 *   - Control pills (e.g. "Show active only") that the caller toggles via onControlChange
 *   - Optional tree view (parentâ†’child via `parentValue`) toggled by the user
 *   - Client-side instant search mode vs server search mode (toggle button)
 *   - Section groupings auto-derived from `option.section` or manual via `meta.sections`
 *   - Draggable header strip and resizable corner handle (caller manages position/size)
 *   - Pagination: loadedCount / totalCount summary + "Load more" button
 *
 * Data-agnostic: all fetching, debouncing, and state live in the caller. This
 * component is purely presentational and calls back through `onQueryChange`,
 * `onSelect`, `onControlChange`, `onLoadMore`, etc.
 *
 * Used by AdvancedEntityCombobox (popover wrapper) and directly in high-density
 * chooser panels in record detail pages.
 */

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  GripHorizontal,
  List,
  ListTree,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { SearchInput } from "./search-input";

export type AdvancedEntityChooserDensity = "mini" | "compact" | "comfortable" | "mobile";
export type AdvancedEntityChooserTone =
  | "default"
  | "muted"
  | "success"
  | "warning"
  | "destructive"
  | "info";

export interface AdvancedEntityChooserBadge {
  label: string;
  tone?: AdvancedEntityChooserTone;
  title?: string;
}

export interface AdvancedEntityChooserOption {
  value: string;
  label: string;
  code?: string;
  description?: string;
  href?: string;
  section?: string;
  badges?: AdvancedEntityChooserBadge[];
  disabled?: boolean;
  treeValue?: string;
  parentValue?: string | null;
  treeLevel?: number | null;
  treeSortValue?: string | number | null;
}

export interface AdvancedEntityChooserControl {
  id: string;
  label: string;
  value: string;
  count?: number;
  disabled?: boolean;
}

export interface AdvancedEntityChooserSection {
  id: string;
  label: string;
}

export interface AdvancedEntityChooserFooterAction {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
  onSelect?: () => void;
}

export interface AdvancedEntityChooserTreeConfig {
  enabled?: boolean;
  parentField?: string;
  valueField?: string;
  levelField?: string;
  sortField?: string;
  minRecords?: number;
}

export interface AdvancedEntityChooserMetaConfig {
  density?: AdvancedEntityChooserDensity;
  placeholder?: string;
  width?: number | string;
  listHeight?: number | string;
  maxListHeight?: number | string;
  controls?: AdvancedEntityChooserControl[];
  sections?: AdvancedEntityChooserSection[];
  footerActions?: AdvancedEntityChooserFooterAction[];
  tree?: AdvancedEntityChooserTreeConfig;
  showKeyboardHints?: boolean;
  optionActionLabel?: string;
}

export interface AdvancedEntityChooserPanelProps {
  query?: string;
  onQueryChange?: (query: string) => void;
  activeControlValue?: string | null;
  onControlChange?: (control: AdvancedEntityChooserControl) => void;
  selectedValue?: string | null;
  onSelect?: (option: AdvancedEntityChooserOption) => void;
  options: AdvancedEntityChooserOption[];
  loading?: boolean;
  meta?: AdvancedEntityChooserMetaConfig;
  optionActionLabel?: string;
  instantSearch?: boolean;
  onInstantSearchToggle?: () => void;
  loadedCount?: number;
  totalCount?: number;
  resultLabel?: string;
  onLoadMore?: () => void;
  loadMoreLoading?: boolean;
  treeEnabled?: boolean;
  onTreeEnabledChange?: (enabled: boolean) => void;
  title?: string;
  onClose?: () => void;
  emptyMessage?: string;
  className?: string;
  /** Show a drag-grip strip at the top so the panel can be repositioned. */
  draggable?: boolean;
  onDragHandleMouseDown?: (e: React.MouseEvent) => void;
  /** Toggle a larger browse surface for record-heavy picker sessions. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Show a resize handle at the bottom-right corner. */
  resizable?: boolean;
  onResizeHandleMouseDown?: (e: React.MouseEvent) => void;
}

const DEFAULT_PANEL_WIDTH = 420;
const DEFAULT_LIST_MAX_HEIGHT = 320;
const DEFAULT_MOBILE_PANEL_WIDTH = "calc(100vw - 32px)";

const DENSITY = {
  mini: {
    panel: "rounded-md shadow-lg",
    header: "p-1.5",
    search: "h-8",
    controls: "mt-1.5 gap-1",
    control: "h-5 px-1.5 text-xs",
    section: "px-2 py-1.5 text-xs",
    row: "gap-2 px-2 py-1.5",
    label: "text-sm",
    meta: "text-xs",
    badge: "h-5 px-1.5 text-xs",
    footer: "px-2 py-1 text-xs",
    defaultWidth: DEFAULT_PANEL_WIDTH,
    defaultMaxHeight: DEFAULT_LIST_MAX_HEIGHT,
  },
  compact: {
    panel: "rounded-md shadow-xl",
    header: "p-2",
    search: "h-8",
    controls: "mt-2 gap-1",
    control: "h-5 px-1.5 text-xs",
    section: "px-2.5 py-1.5 text-xs",
    row: "gap-2.5 px-2.5 py-2",
    label: "text-sm",
    meta: "text-xs",
    badge: "h-5 px-1.5 text-xs",
    footer: "px-2 py-1.5 text-xs",
    defaultWidth: DEFAULT_PANEL_WIDTH,
    defaultMaxHeight: DEFAULT_LIST_MAX_HEIGHT,
  },
  comfortable: {
    panel: "rounded-md shadow-xl",
    header: "p-2.5",
    search: "h-9",
    controls: "mt-2 gap-1.5",
    control: "h-6 px-2 text-xs",
    section: "px-3 py-2 text-xs",
    row: "gap-3 px-3 py-2.5",
    label: "text-sm",
    meta: "text-xs",
    badge: "h-5 px-1.5 text-xs",
    footer: "px-2.5 py-1.5 text-xs",
    defaultWidth: DEFAULT_PANEL_WIDTH,
    defaultMaxHeight: DEFAULT_LIST_MAX_HEIGHT,
  },
  mobile: {
    panel: "rounded-t-xl shadow-2xl",
    header: "p-2.5",
    search: "h-9",
    controls: "mt-2 gap-1",
    control: "h-6 px-2 text-xs",
    section: "px-3 py-2 text-xs",
    row: "gap-2.5 px-3 py-2.5",
    label: "text-sm",
    meta: "text-xs",
    badge: "h-5 px-1.5 text-xs",
    footer: "px-3 py-2 text-xs",
    defaultWidth: DEFAULT_MOBILE_PANEL_WIDTH,
    defaultMaxHeight: DEFAULT_LIST_MAX_HEIGHT,
  },
} satisfies Record<AdvancedEntityChooserDensity, Record<string, string | number>>;

const BADGE_TONE: Record<AdvancedEntityChooserTone, string> = {
  default: "border-border bg-background text-foreground",
  muted: "border-border bg-muted text-muted-foreground",
  success: "border-success/20 bg-success/15 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/20 bg-destructive/15 text-destructive",
  info: "border-info/20 bg-info/15 text-info",
};

function cssLength(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export function AdvancedEntityChooserPanel({
  query = "",
  onQueryChange,
  activeControlValue,
  onControlChange,
  selectedValue,
  onSelect,
  options,
  loading = false,
  meta,
  optionActionLabel,
  instantSearch = false,
  onInstantSearchToggle,
  loadedCount,
  totalCount,
  resultLabel,
  onLoadMore,
  loadMoreLoading = false,
  treeEnabled = false,
  onTreeEnabledChange,
  title,
  onClose,
  emptyMessage = "No matches",
  className,
  draggable,
  onDragHandleMouseDown,
  expanded = false,
  onExpandedChange,
  resizable,
  onResizeHandleMouseDown,
}: AdvancedEntityChooserPanelProps) {
  const density = meta?.density ?? "compact";
  const d = DENSITY[density];
  const controls = meta?.controls ?? [];
  const displayOptions = useMemo(
    () => instantSearch ? options.filter((option) => optionMatchesQuery(option, query)) : options,
    [instantSearch, options, query],
  );
  const hasCode = displayOptions.some((o) => !!o.code);
  const hasDescription = displayOptions.some((o) => !!o.description);
  const hasBadges = displayOptions.some((o) => (o.badges?.length ?? 0) > 0);
  const hasExternalLinks = displayOptions.some((o) => !!o.href);
  const sections = meta?.sections ?? deriveSections(displayOptions);
  const treeSupported = !!meta?.tree?.enabled && !!onTreeEnabledChange;
  const treeNodes = useMemo(
    () => treeSupported && treeEnabled ? buildChooserTree(displayOptions) : [],
    [displayOptions, treeEnabled, treeSupported],
  );
  const treeRootKey = useMemo(() => treeNodes.map((node) => chooserTreeKey(node.option)).join("|"), [treeNodes]);
  const [expandedTreeIds, setExpandedTreeIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!treeSupported || !treeEnabled) {
      setExpandedTreeIds(new Set());
      return;
    }
    const next = query.trim()
      ? new Set(collectChooserTreeIds(treeNodes))
      : new Set(treeNodes.map((node) => chooserTreeKey(node.option)));
    setExpandedTreeIds(next);
  }, [query, treeEnabled, treeRootKey, treeSupported, treeNodes]);
  const treeRows = useMemo(
    () => treeEnabled ? flattenChooserTree(treeNodes, expandedTreeIds) : [],
    [expandedTreeIds, treeEnabled, treeNodes],
  );
  const width = meta?.width ?? d.defaultWidth;
  const listHeight = meta?.listHeight;
  const maxListHeight = meta?.maxListHeight ?? d.defaultMaxHeight;
  const hasHeaderTitle = !!title || !!onClose;
  const resolvedOptionActionLabel = optionActionLabel ?? meta?.optionActionLabel ?? "View record";
  const summaryLoadedCount = instantSearch ? displayOptions.length : (loadedCount ?? displayOptions.length);
  const hasResultSummary = totalCount !== undefined || resultLabel !== undefined;
  const hasFooter = hasResultSummary || !!onLoadMore || (meta?.footerActions?.length ?? 0) > 0;
  const expandable = !!onExpandedChange;

  return (
    <div
      data-advanced-entity-chooser-panel="true"
      className={cn("relative overflow-hidden border bg-popover font-sans text-popover-foreground", d.panel, className)}
      style={{ width: cssLength(width) }}
    >
      {(draggable || expandable) && (
        <div
          onMouseDown={draggable ? onDragHandleMouseDown : undefined}
          title={draggable ? "Drag to reposition" : undefined}
          className={cn(
            "group relative flex h-5 items-center justify-center border-b select-none transition-colors duration-150 hover:bg-muted/50",
            draggable && "cursor-grab active:cursor-grabbing active:bg-muted/70",
          )}
        >
          <GripHorizontal className="size-3 text-muted-foreground/30 transition-all duration-150 group-hover:scale-110 group-hover:text-muted-foreground/70 group-active:scale-90 group-active:text-muted-foreground/90" />
          {expandable && (
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onExpandedChange?.(!expanded);
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.detail === 0) onExpandedChange?.(!expanded);
              }}
              title={expanded ? "Collapse chooser" : "Expand chooser"}
              aria-label={expanded ? "Collapse chooser" : "Expand chooser"}
              className="absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
            </button>
          )}
        </div>
      )}

      {hasHeaderTitle && (
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{title}</p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close chooser"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      <div className={cn("border-b", d.header)}>
        <SearchInput
          value={query}
          onSearch={(value) => onQueryChange?.(value)}
          debounceMs={0}
          loading={loading}
          placeholder={meta?.placeholder ?? "Search..."}
          aria-label={meta?.placeholder ?? "Search"}
          className={cn("w-full", d.search)}
          modeToggle={onInstantSearchToggle ? {
            active: instantSearch,
            onToggle: onInstantSearchToggle,
            activeLabel: "In view",
            inactiveLabel: "All",
            icon: <Zap className="size-3" />,
            title: instantSearch
              ? "Instant search: filtering loaded chooser results - click to search all records"
              : "Server search: querying all records - click to filter loaded chooser results instantly",
          } : undefined}
        />

        {(controls.length > 0 || treeSupported) && (
          <div className={cn("flex items-center gap-1.5", d.controls)}>
            {controls.length > 0 && (
              <div className="flex min-w-0 flex-1 overflow-x-auto pb-0.5">
                {controls.map((control) => {
                  const active = activeControlValue === control.value;
                  return (
                    <button
                      key={control.id}
                      type="button"
                      disabled={control.disabled}
                      onClick={() => onControlChange?.(control)}
                      className={cn(
                        "mr-1 inline-flex shrink-0 items-center rounded-full border font-medium leading-none transition-colors disabled:opacity-50",
                        d.control,
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      <span>{control.label}</span>
                      {typeof control.count === "number" && (
                        <span className="ml-0.5 tabular-nums">-{control.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {treeSupported && (
              <button
                type="button"
                aria-pressed={treeEnabled}
                title={treeEnabled ? "Tree view on" : "Tree view off"}
                onClick={() => onTreeEnabledChange?.(!treeEnabled)}
                className={cn(
                  "ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border font-medium leading-none transition-colors",
                  d.control,
                  treeEnabled
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                <ListTree className="size-3" />
                <span>Tree</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div
        data-advanced-entity-chooser-list="true"
        className="overflow-y-auto"
        style={{
          height: cssLength(listHeight),
          maxHeight: cssLength(maxListHeight),
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center px-3 py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : displayOptions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{emptyMessage}</div>
        ) : treeEnabled && treeSupported ? (
          treeRows.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">{emptyMessage}</div>
          ) : (
            <div>
              <div className={cn("flex items-center gap-2 border-b bg-muted/20 font-medium text-muted-foreground", d.section)}>
                <ListTree className="size-3" />
                Hierarchy
              </div>
              {treeRows.map((row) => (
                <ChooserTreeOptionRow
                  key={row.node.option.value}
                  node={row.node}
                  depth={row.depth}
                  expanded={expandedTreeIds.has(chooserTreeKey(row.node.option))}
                  selected={selectedValue === row.node.option.value}
                  density={density}
                  optionActionLabel={resolvedOptionActionLabel}
                  hasCode={hasCode}
                  hasDescription={hasDescription}
                  hasBadges={hasBadges}
                  onToggle={() => {
                    setExpandedTreeIds((current) => {
                      const treeKey = chooserTreeKey(row.node.option);
                      const next = new Set(current);
                      if (next.has(treeKey)) next.delete(treeKey);
                      else next.add(treeKey);
                      return next;
                    });
                  }}
                  onSelect={() => onSelect?.(row.node.option)}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {(hasCode || hasDescription || hasBadges) && (
              <div className={cn(
                "sticky top-0 z-10 flex items-center border-b bg-muted/40",
                d.section,
              )}>
                {hasCode && (
                  <span className="w-20 shrink-0 tabular-nums text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                    Code
                  </span>
                )}
                <span className="min-w-0 flex-1" />
                {hasDescription && (
                  <span className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                    Type
                  </span>
                )}
                {hasBadges && (
                  <span className="w-[72px] shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                    Status
                  </span>
                )}
                {hasExternalLinks && <span className="w-9 shrink-0" />}
              </div>
            )}
            {sections.map((section) => {
              const sectionOptions = displayOptions.filter((option) => (option.section ?? "matches") === section.id);
              if (sectionOptions.length === 0) return null;

              return (
                <div key={section.id}>
                  <div className={cn("flex items-center gap-2 border-b bg-muted/20 font-medium text-muted-foreground", d.section)}>
                    <SectionIcon id={section.id} />
                    {section.label}
                  </div>
                  {sectionOptions.map((option) => (
                    <ChooserOptionRow
                      key={option.value}
                      option={option}
                      selected={selectedValue === option.value}
                      density={density}
                      optionActionLabel={resolvedOptionActionLabel}
                      hasCode={hasCode}
                      hasDescription={hasDescription}
                      hasBadges={hasBadges}
                      onSelect={() => onSelect?.(option)}
                    />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>

      {hasFooter && (
        <div
          className={cn(
            "flex items-center justify-between border-t bg-muted/30 text-muted-foreground",
            d.footer,
            resizable && "pr-7",
          )}
        >
          {hasResultSummary ? (
            <p className="min-w-0 truncate">
              Showing <span className="font-medium text-foreground">{summaryLoadedCount.toLocaleString()}</span>
              {typeof totalCount === "number" && (
                <>
                  {" "}of <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span>
                </>
              )}
              {resultLabel && <> {resultLabel}</>}
            </p>
          ) : <span />}
          <div className="flex shrink-0 items-center gap-1.5">
            {onLoadMore && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loading || loadMoreLoading}
                className="inline-flex items-center rounded-sm border border-border bg-background px-1.5 py-0.5 font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading || loadMoreLoading ? "Loading..." : "Load more"}
              </button>
            )}
            {meta?.footerActions?.map((action) => {
              const content = (
                <>
                  {action.icon ?? <ExternalLink className="size-3" />}
                  {action.label}
                </>
              );

              if (action.href) {
                return (
                  <a
                    key={action.id}
                    href={action.href}
                    className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-background hover:text-foreground"
                  >
                    {content}
                  </a>
                );
              }

              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onSelect}
                  className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-background hover:text-foreground"
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {resizable && (
        <div
          onMouseDown={onResizeHandleMouseDown}
          title="Drag to resize"
          className="group absolute bottom-0 right-0 flex size-5 cursor-se-resize select-none items-end justify-end p-1"
        >
          <svg
            width="9" height="9" viewBox="0 0 9 9"
            className="text-muted-foreground/35 transition-all duration-150 group-hover:scale-125 group-hover:text-primary/60 group-active:scale-110 group-active:text-primary/80"
          >
            <circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" />
            <circle cx="4"   cy="7.5" r="1.1" fill="currentColor" />
            <circle cx="7.5" cy="4"   r="1.1" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}

interface ChooserTreeNode {
  option: AdvancedEntityChooserOption;
  children: ChooserTreeNode[];
}

function ChooserOptionRow({
  option,
  selected,
  density,
  optionActionLabel,
  hasCode,
  hasDescription,
  hasBadges,
  onSelect,
}: {
  option: AdvancedEntityChooserOption;
  selected: boolean;
  density: AdvancedEntityChooserDensity;
  optionActionLabel: string;
  hasCode: boolean;
  hasDescription: boolean;
  hasBadges: boolean;
  onSelect: () => void;
}) {
  const d = DENSITY[density];

  return (
    <div
      className={cn(
        "group flex w-full items-stretch border-b border-l-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
        selected ? "border-l-primary bg-primary/10" : "border-l-transparent bg-popover",
      )}
    >
      <button
        type="button"
        disabled={option.disabled}
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center text-left disabled:cursor-not-allowed disabled:opacity-50",
          d.row,
        )}
      >
        {hasCode && (
          <span className="w-20 shrink-0 truncate tabular-nums text-muted-foreground">
            {option.code ?? ""}
          </span>
        )}
        <span className={cn("min-w-0 flex-1 truncate font-medium leading-tight", d.label)}>
          {option.label}
        </span>
        {hasDescription && (
          <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
            {option.description ?? ""}
          </span>
        )}
        {hasBadges && (
          <div className="flex w-[72px] shrink-0 items-center justify-end gap-1">
            {option.badges?.map((badge) => (
              <span
                key={`${option.value}-${badge.label}`}
                title={badge.title}
                className={cn(
                  "inline-flex items-center rounded-sm border font-medium leading-none",
                  d.badge,
                  BADGE_TONE[badge.tone ?? "muted"],
                )}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </button>
      {option.href && (
        <a
          href={option.href}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          title={optionActionLabel}
          aria-label={`${optionActionLabel}: ${option.label}`}
          className="flex w-9 shrink-0 items-center justify-center text-muted-foreground opacity-70 transition hover:bg-background/70 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function ChooserTreeOptionRow({
  node,
  depth,
  expanded,
  selected,
  density,
  optionActionLabel,
  hasCode,
  hasDescription,
  hasBadges,
  onToggle,
  onSelect,
}: {
  node: ChooserTreeNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  density: AdvancedEntityChooserDensity;
  optionActionLabel: string;
  hasCode: boolean;
  hasDescription: boolean;
  hasBadges: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const d = DENSITY[density];
  const option = node.option;
  const hasChildren = node.children.length > 0;
  const indent = Math.min(depth, 8) * 14;

  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      className={cn(
        "group flex w-full items-stretch border-b border-l-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
        selected ? "border-l-primary bg-primary/10" : "border-l-transparent bg-popover",
      )}
    >
      <div className={cn("flex min-w-0 flex-1 items-center", d.row)}>
        <span style={{ width: indent }} className="shrink-0" />
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            title={expanded ? "Collapse" : "Expand"}
            aria-label={expanded ? `Collapse ${option.label}` : `Expand ${option.label}`}
            className="mr-1 flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        ) : (
          <span className="mr-1 size-4 shrink-0" />
        )}
        <button
          type="button"
          disabled={option.disabled}
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hasCode && (
            <span className="w-20 shrink-0 truncate tabular-nums text-muted-foreground">
              {option.code ?? ""}
            </span>
          )}
          <span className={cn("min-w-0 flex-1 truncate font-medium leading-tight", d.label)}>
            {option.label}
          </span>
          {hasDescription && (
            <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
              {option.description ?? ""}
            </span>
          )}
          {hasBadges && (
            <div className="flex w-[72px] shrink-0 items-center justify-end gap-1">
              {option.badges?.map((badge) => (
                <span
                  key={`${option.value}-${badge.label}`}
                  title={badge.title}
                  className={cn(
                    "inline-flex items-center rounded-sm border font-medium leading-none",
                    d.badge,
                    BADGE_TONE[badge.tone ?? "muted"],
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </button>
      </div>
      {option.href && (
        <a
          href={option.href}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          title={optionActionLabel}
          aria-label={`${optionActionLabel}: ${option.label}`}
          className="flex w-9 shrink-0 items-center justify-center text-muted-foreground opacity-70 transition hover:bg-background/70 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function SectionIcon({ id }: { id: string }) {
  if (id === "recent") return <Clock3 className="size-3" />;
  if (id === "matches") return <List className="size-3" />;
  return <span className="h-1.5 w-1.5 rounded-full border border-muted-foreground/40" />;
}

function compareChooserOptions(left: AdvancedEntityChooserOption, right: AdvancedEntityChooserOption): number {
  const leftSort = left.treeSortValue;
  const rightSort = right.treeSortValue;
  if (typeof leftSort === "number" && typeof rightSort === "number" && leftSort !== rightSort) {
    return leftSort - rightSort;
  }
  if (leftSort !== undefined && leftSort !== null && rightSort !== undefined && rightSort !== null) {
    const bySort = String(leftSort).localeCompare(String(rightSort), undefined, { numeric: true, sensitivity: "base" });
    if (bySort !== 0) return bySort;
  }
  return (left.code ?? left.label).localeCompare(right.code ?? right.label, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function buildChooserTree(options: AdvancedEntityChooserOption[]): ChooserTreeNode[] {
  const nodes = new Map<string, ChooserTreeNode>();
  const orderedOptions = [...options].sort(compareChooserOptions);
  orderedOptions.forEach((option) => nodes.set(chooserTreeKey(option), { option, children: [] }));

  const roots: ChooserTreeNode[] = [];
  nodes.forEach((node) => {
    const nodeKey = chooserTreeKey(node.option);
    const parentValue = node.option.parentValue;
    const parent = parentValue && parentValue !== nodeKey ? nodes.get(parentValue) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const sortChildren = (items: ChooserTreeNode[]) => {
    items.sort((left, right) => compareChooserOptions(left.option, right.option));
    items.forEach((item) => sortChildren(item.children));
  };
  sortChildren(roots);
  return roots;
}

function collectChooserTreeIds(nodes: ChooserTreeNode[]): string[] {
  return nodes.flatMap((node) => [chooserTreeKey(node.option), ...collectChooserTreeIds(node.children)]);
}

function flattenChooserTree(
  nodes: ChooserTreeNode[],
  expandedIds: Set<string>,
  depth = 0,
): Array<{ node: ChooserTreeNode; depth: number }> {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(expandedIds.has(chooserTreeKey(node.option)) ? flattenChooserTree(node.children, expandedIds, depth + 1) : []),
  ]);
}

function chooserTreeKey(option: AdvancedEntityChooserOption): string {
  return option.treeValue ?? option.value;
}

function optionMatchesQuery(option: AdvancedEntityChooserOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    option.label,
    option.code,
    option.description,
    ...(option.badges ?? []).map((badge) => badge.label),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(needle));
}

function deriveSections(options: AdvancedEntityChooserOption[]): AdvancedEntityChooserSection[] {
  const ids = Array.from(new Set(options.map((option) => option.section ?? "matches")));
  return ids.map((id) => ({ id, label: id === "matches" ? "All matches" : labelFromId(id) }));
}

function labelFromId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

