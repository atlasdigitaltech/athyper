// components/mesh/list/types.ts
//
// Core generic types for the CollectionExplorerPage system.
// All zone components reference these types via ListPageConfig<T>.

import type { LucideIcon } from "lucide-react";
import type React from "react";

// ─── View Mode ──────────────────────────────────────────────

export type ViewMode =
  | "table"
  | "table-columns"
  | "card-grid"
  | "kanban"
  | "timeline"
  | "tree";

export interface ViewModeDef {
  mode: ViewMode;
  label: string;
  icon: LucideIcon;
}

// ─── Column Definitions ──────────────────────────────────────

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: (item: T) => React.ReactNode;
  /** Key used for sorting. undefined = column not sortable. */
  sortKey?: string;
  /** Custom sort comparator. Falls back to string comparison on sortKey. */
  sortFn?: (a: T, b: T) => number;
  align?: "left" | "center" | "right";
  /** Tailwind width class, e.g. "w-[200px]" */
  width?: string;
  hidden?: boolean;
  /** Eligible for group-by operations */
  groupable?: boolean;
  /** Can be pinned left/right in adjustable columns view */
  pinnable?: boolean;
  /** Current pin state */
  pinned?: "left" | "right" | false;
  /** Appears in Adapt Filters panel */
  filterable?: boolean;
  /** Filter control type when filterable */
  filterType?: "text" | "select" | "date" | "boolean";
  /** Options for select-type filters */
  filterOptions?: { value: string; label: string }[];
}

// ─── Sort & Group Rules ─────────────────────────────────────

export interface SortRule {
  fieldId: string;
  dir: "asc" | "desc";
}

export interface GroupRule {
  fieldId: string;
  dir?: "asc" | "desc";
  collapsed?: boolean;
}

export type Density = "compact" | "comfortable" | "spacious";

/** Table density classes shared by EntityDataGrid and AdjustableDataGrid. */
export const DENSITY_TABLE_CLASSES: Record<Density, string> = {
  compact: "[&_th]:py-1 [&_td]:py-1 text-xs",
  comfortable: "",
  spacious: "[&_th]:py-3 [&_td]:py-3",
};

// ─── Filter Definitions ──────────────────────────────────────

export interface QuickFilterDef {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  /** Default value, typically "all" */
  defaultValue: string;
}

export interface AdvancedFilterFieldDef {
  id: string;
  label: string;
  type: "text" | "select" | "date" | "dateRange" | "multiSelect";
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Grid column placement (1–3) */
  column?: 1 | 2 | 3;
}

// ─── KPI Definitions ─────────────────────────────────────────

export type KpiVariant = "default" | "warning" | "critical";

export interface KpiDef<T> {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Compute the KPI value from the full (unfiltered) item list */
  compute: (items: T[]) => number | string;
  format?: "number" | "currency" | "percent";
  /** Filters to apply when the KPI card is clicked */
  filterOnClick?: Record<string, string>;
  variant?: KpiVariant;
  /** Dynamic variant based on computed numeric value */
  variantFn?: (value: number) => KpiVariant;
}

// ─── Action Definitions ──────────────────────────────────────

export interface RowAction<T> {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick: (item: T) => void;
  variant?: "default" | "destructive";
  disabled?: (item: T) => boolean;
  disabledReason?: (item: T) => string;
  hidden?: (item: T) => boolean;
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick: (items: T[]) => void;
  variant?: "default" | "destructive";
}

// ─── Tree Definitions ──────────────────────────────────────

export interface TreeConfig {
  /** Field name containing the parent ID (e.g. "parent_id") */
  parentField: string;
  /** Optional field name containing the hierarchy level (e.g. "level") */
  levelField?: string;
  /** Optional field name indicating group/branch nodes (e.g. "is_group") */
  isGroupField?: string;
}

// ─── Kanban Definitions ─────────────────────────────────────

export interface KanbanLaneDef {
  id: string;
  label: string;
  icon?: LucideIcon;
}

export interface KanbanConfig<T> {
  getLaneId: (item: T) => string;
  lanes: KanbanLaneDef[];
  cardRenderer?: (item: T) => React.ReactNode;
  draggable?: boolean;
  onDrop?: (item: T, fromLane: string, toLane: string) => void;
  /** Show pagination in kanban mode. Default: false (show all items). */
  paginate?: boolean;
}

// ─── View Presets ───────────────────────────────────────────

export type PresetScope = "personal" | "team" | "tenant";

export interface ViewPreset {
  id: string;
  label: string;
  scope?: PresetScope;
  viewMode?: ViewMode;
  filters?: Record<string, string>;
  search?: string;
  /** @deprecated Use sortRules for multi-sort. Kept for backwards compat. */
  sortKey?: string | null;
  /** @deprecated Use sortRules for multi-sort. Kept for backwards compat. */
  sortDir?: "asc" | "desc";
  sortRules?: SortRule[];
  groupBy?: GroupRule[];
  columnVisibility?: Record<string, boolean>;
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
  filterBarFields?: string[];
  density?: Density;
  pageSize?: number;
  showPreview?: boolean;
  isDefault?: boolean;
  /** DB version for optimistic concurrency (present only for API-backed presets). */
  version?: number;
}

// ─── Explorer Capabilities ─────────────────────────────────

export interface ExplorerCapabilities {
  supportsBoard: boolean;
  supportsTimeline: boolean;
  supportsTree: boolean;
  supportsGroup: boolean;
  supportsCards: boolean;
  supportsAdjustableColumns: boolean;
  groupableColumns: string[];
  boardCandidateColumns: string[];
}

// ─── Grouped Items ─────────────────────────────────────────

export interface ItemGroup<T> {
  key: string;
  label: string;
  items: T[];
  collapsed: boolean;
}

// ─── Preview ────────────────────────────────────────────────

export type PreviewRenderer<T> = (
  item: T,
  onClose: () => void,
) => React.ReactNode;

// ─── List Page Configuration ─────────────────────────────────

export interface ListPageConfig<T> {
  // Identity
  pageTitle: string;
  entityLabel: string;
  entityLabelPlural: string;
  icon: LucideIcon;
  basePath: string;
  getId: (item: T) => string;
  getItemHref?: (item: T) => string;

  // Zone 2 — KPI summary
  kpis?: KpiDef<T>[];

  // Zone 3 — Command bar
  searchPlaceholder: string;
  searchFn: (item: T, query: string) => boolean;
  quickFilters: QuickFilterDef[];
  filterFn: (item: T, filters: Record<string, string>) => boolean;

  // Zone 3B — Advanced filters
  advancedFilters?: AdvancedFilterFieldDef[];

  // Zone 4 — Results
  columns: ColumnDef<T>[];
  cardRenderer: (item: T) => React.ReactNode;

  // Zone 4 — View configuration
  availableViews?: ViewMode[];
  defaultViewMode?: ViewMode;
  /** Desktop default (>= 1024px). Falls back to defaultViewMode. */
  defaultViewModeDesktop?: ViewMode;
  /** Default density (mobile-first). Falls back to "compact". */
  defaultDensity?: Density;
  /** Desktop density (>= 1024px). Falls back to defaultDensity. */
  defaultDensityDesktop?: Density;
  kanban?: KanbanConfig<T>;
  /** Timeline view configuration. When defined, enables the timeline view mode. */
  timeline?: { dateField: string; endDateField?: string };
  /** Tree view configuration. When defined, enables the tree view mode. */
  tree?: TreeConfig;
  previewRenderer?: PreviewRenderer<T>;
  presets?: ViewPreset[];

  // Zone 5 — Row expansion
  expandRenderer?: (item: T) => React.ReactNode;

  // Zone 5 — Filter mode
  /** "auto" = instant apply (default), "explicit" = Go/Clear buttons */
  filterMode?: "auto" | "explicit";

  // Actions
  primaryAction?: { label: string; icon?: LucideIcon; onClick: () => void };
  rowActions?: RowAction<T>[];
  bulkActions?: BulkAction<T>[];
}

// ─── Shared State ────────────────────────────────────────────

export interface ListPageState {
  search: string;
  filters: Record<string, string>;
  advancedFilters: Record<string, string>;
  advancedOpen: boolean;
  /** @deprecated Legacy single-sort. Use sortRules for multi-sort. */
  sortKey: string | null;
  /** @deprecated Legacy single-sort. Use sortRules for multi-sort. */
  sortDir: "asc" | "desc";
  sortRules: SortRule[];
  groupBy: GroupRule[];
  density: Density;
  viewMode: ViewMode;
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  page: number;
  pageSize: number;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  columnSizing: Record<string, number>;
  filterBarFields: string[];
  previewItemId: string | null;
  activePresetId: string | null;
  settingsOpen: boolean;
  settingsDraft: Partial<ListPageState> | null;
  adaptFiltersOpen: boolean;
  presetDirty: boolean;
  collapsedGroups: Set<string>;
  /** Which tab to open by default when ViewSettingsSheet opens */
  settingsDefaultTab: "view" | "filter" | "columns" | "sort" | "group" | null;
}

// ─── Reducer Actions ─────────────────────────────────────────

export type ListPageAction =
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_FILTER"; payload: { key: string; value: string } }
  | { type: "SET_FILTERS"; payload: Record<string, string> }
  | { type: "REMOVE_FILTER"; payload: string }
  | { type: "CLEAR_FILTERS" }
  | { type: "SET_ADVANCED_FILTER"; payload: { key: string; value: string } }
  | { type: "APPLY_ADVANCED_FILTERS" }
  | { type: "CLEAR_ADVANCED_FILTERS" }
  | { type: "TOGGLE_ADVANCED" }
  | { type: "SET_SORT"; payload: { key: string } }
  | { type: "SET_SORT_RULES"; payload: SortRule[] }
  | { type: "SET_GROUP_BY"; payload: GroupRule[] }
  | { type: "TOGGLE_GROUP_COLLAPSE"; payload: string }
  | { type: "SET_DENSITY"; payload: Density }
  | { type: "SET_VIEW_MODE"; payload: ViewMode }
  | { type: "TOGGLE_SELECT"; payload: string }
  | { type: "SELECT_ALL"; payload: string[] }
  | { type: "DESELECT_ALL" }
  | { type: "TOGGLE_EXPAND"; payload: string }
  | { type: "EXPAND_ALL"; payload: string[] }
  | { type: "COLLAPSE_ALL" }
  | { type: "SET_PAGE"; payload: number }
  | { type: "SET_PAGE_SIZE"; payload: number }
  | { type: "SET_COLUMN_VISIBILITY"; payload: Record<string, boolean> }
  | { type: "SET_COLUMN_ORDER"; payload: string[] }
  | { type: "SET_COLUMN_SIZING"; payload: Record<string, number> }
  | { type: "SET_FILTER_BAR"; payload: string[] }
  | { type: "SET_PREVIEW_ITEM"; payload: string | null }
  | { type: "APPLY_PRESET"; payload: ViewPreset }
  | { type: "OPEN_SETTINGS" }
  | { type: "CLOSE_SETTINGS" }
  | { type: "APPLY_SETTINGS"; payload: Partial<ListPageState> }
  | { type: "OPEN_ADAPT_FILTERS" }
  | { type: "CLOSE_ADAPT_FILTERS" }
  | { type: "SET_PRESET_DIRTY"; payload: boolean }
  | {
      type: "SET_SETTINGS_DEFAULT_TAB";
      payload: "view" | "filter" | "columns" | "sort" | "group" | null;
    };

// ─── Infinite Scroll ────────────────────────────────────────

export type ScrollMode = "paginated" | "infinite";

export interface InfiniteScrollState {
  scrollMode: ScrollMode;
  /** Trigger next page load. Null when no more pages or at item cap. */
  loadMore: (() => void) | null;
  /** True when there are more pages to load from the server. */
  hasMore: boolean;
  /** True when a "load more" request is in flight. */
  loadingMore: boolean;
  /** True when the most recent load-more request failed (shows retry button). */
  loadMoreError: boolean;
  /** Total items loaded so far in infinite mode. */
  loadedCount: number;
  /** Total items available on the server (from pagination meta). */
  totalCount: number;
  /** Scroll the list container to the top. */
  scrollToTop: () => void;
  /** Current page size for load-more batches. */
  pageSize: number;
  /** Change the page size for subsequent load-more requests. */
  onPageSizeChange: (size: number) => void;
}
