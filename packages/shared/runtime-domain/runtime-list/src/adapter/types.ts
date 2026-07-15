import type React from "react";
import type {
  RuntimeDescriptor,
  RuntimeField,
  RuntimeListRecordState,
  RuntimeListPagination,
  RuntimeListSearchControls,
  RuntimeListSearchPresenterState,
  RuntimeListLazyControls,
  RuntimeListLazyPresenterState,
  RuntimeRecordRow,
  RuntimeListState,
  RuntimeAccessScope,
  RuntimeAccessScopeLabel,
  RuntimeAccessContext,
  RuntimeScopePlane,
  RawSearchParams,
  SaveableListState,
  ViewMode,
  ViewDensity,
  ResolvedColumn,
  ActiveFilterEntry,
  SortEntry,
  ResolvedToolbarAction,
  RuntimeListPresentation,
  RuntimeListPresentationConfig,
  RuntimeCompactPresentation,
  RuntimeExcelPresentation,
  RuntimeColumnAggregation,
} from "../core/types";

export type {
  RawSearchParams,
  ViewMode,
  ViewDensity,
  RuntimeDescriptor,
  RuntimeField,
  RuntimeRecordRow,
  RuntimeListState,
  RuntimeAccessScope,
  RuntimeAccessScopeLabel,
  RuntimeAccessContext,
  RuntimeScopePlane,
  SaveableListState,
  RuntimeListPagination,
  RuntimeListRecordState,
  RuntimeListSearchControls,
  RuntimeListSearchPresenterState,
  RuntimeListLazyControls,
  RuntimeListLazyPresenterState,
  ResolvedColumn,
  ActiveFilterEntry,
  SortEntry,
  ResolvedToolbarAction,
  RuntimeListPresentation,
  RuntimeListPresentationConfig,
  RuntimeCompactPresentation,
  RuntimeExcelPresentation,
  RuntimeColumnAggregation,
};

// ─── Feature flags ────────────────────────────────────────────────────────────

export interface RuntimeListFeatures {
  savedViews:          boolean;
  bulkActions:         boolean;
  export:              boolean;
  import:              boolean;
  columnCustomization: boolean;
  grouping:            boolean;
  multiSort:           boolean;
  maxSortLevels:       number;
  viewModes:           ViewMode[];
  searchMode:          "server" | "client" | "both";
  maxPageSize:         number;
}

export type RuntimeListFeatureConfig =
  Pick<RuntimeListFeatures, "viewModes" | "searchMode" | "maxPageSize"> &
  Partial<Omit<RuntimeListFeatures, "viewModes" | "searchMode" | "maxPageSize">>;

export type OrganizeControlName =
  | "search"
  | "filter"
  | "sort"
  | "group"
  | "columns"
  | "density"
  | "viewMode"
  | "savedViews";

export function normalizeRuntimeListFeatures(features: RuntimeListFeatureConfig): RuntimeListFeatures {
  const multiSort = Boolean(features.multiSort);
  return {
    savedViews:          Boolean(features.savedViews),
    bulkActions:         Boolean(features.bulkActions),
    export:              Boolean(features.export),
    import:              Boolean(features.import),
    columnCustomization: Boolean(features.columnCustomization),
    grouping:            Boolean(features.grouping),
    multiSort,
    maxSortLevels:       normalizeMaxSortLevels(features.maxSortLevels, multiSort),
    viewModes:           features.viewModes,
    searchMode:          features.searchMode,
    maxPageSize:         features.maxPageSize,
  };
}

function normalizeMaxSortLevels(value: number | undefined, multiSort: boolean): number {
  if (!multiSort) return 1;
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(2, Math.trunc(value)));
}

// ─── App shell contract ───────────────────────────────────────────────────────

export interface RuntimeListPageFrameProps {
  eyebrow:    string;
  title:      string;
  description:string;
  commandBar?:React.ReactNode;
  actions?:   React.ReactNode;
  toolbar?:   React.ReactNode;
  children:   React.ReactNode;
}

// ─── Data shapes ──────────────────────────────────────────────────────────────

export interface EntityListResponse {
  records:     RuntimeRecordRow[];
  state?:      RuntimeListRecordState;
  pagination?: RuntimeListPagination;
  isFullyLoaded?: boolean;
  reasons?:    Record<string, boolean>;
}

export type SavedViewScope = "private" | "shared" | "system";
export type SavedViewState = Partial<SaveableListState>;

export interface SavedView {
  id:          string;
  name:        string;
  is_default?: boolean;
  is_shared?:  boolean;
  can_delete?: boolean;
  scope?:      SavedViewScope;
  owner_name?: string;
  created_at?: string;
  updated_at?: string;
  state?:      SavedViewState;
  config?:     SavedViewState & Record<string, unknown>;
}

// ─── Client adapter — serializable, passed to islands as props ────────────────

export interface RuntimeListClientAdapter {
  entityCode:     string;
  features:       RuntimeListFeatures;
  listBaseHref:   string;
  detailHrefBase: string;
  newHref:        string | null;
  recordsApiHref?:string | null;
  savedViewsApiHref?: string | null;
  fieldOptionsApiHrefBase?: string | null;
}

// ─── Slots — app-level extension points ──────────────────────────────────────

export interface RuntimeListSlots {
  organizeLeading?:     React.ReactNode;
  organizeTrailing?:    React.ReactNode;
  aboveTable?:          React.ReactNode;
  belowTable?:          React.ReactNode;
  emptyState?:          React.ReactNode;
}

// ─── Server adapter ───────────────────────────────────────────────────────────
// Runs only on the server. Functions are NOT serialized to the client.

export interface RuntimeListServerAdapter {
  plane: RuntimeScopePlane;
  features: RuntimeListFeatureConfig;

  // Descriptor first — always fetched before records.
  fetchDescriptor(entityCode: string): Promise<RuntimeDescriptor | null>;

  resolveAccessScope?(
    entityCode: string,
    descriptor: RuntimeDescriptor,
  ): Promise<RuntimeAccessScope>;

  resolveSearchControls?(
    entityCode:  string,
    descriptor:  RuntimeDescriptor,
    accessScope: RuntimeAccessScope,
  ): Promise<Partial<RuntimeListSearchControls> | null>;

  resolveLazyListControls?(
    entityCode:  string,
    descriptor:  RuntimeDescriptor,
    accessScope: RuntimeAccessScope,
  ): Promise<Partial<RuntimeListLazyControls> | null>;

  // rawSearchParams passed through so the server function (e.g. getMetaEntityRecordList)
  // handles its own URL parsing, scope filters, hydration, and PII masking.
  // descriptor flows in for scope/masking — avoids a second fetch inside the implementation.
  fetchRecords(
    entityCode:      string,
    rawSearchParams: RawSearchParams,
    descriptor:      RuntimeDescriptor,
    accessScope:     RuntimeAccessScope,
  ): Promise<EntityListResponse>;

  // Optional saved-view support
  fetchSavedViews?(entityCode: string): Promise<SavedView[]>;
  fetchSavedView?(viewId: string, entityCode?: string): Promise<Partial<RuntimeListState> | null>;

  // Navigation — called on server to build static hrefs
  entityListHref(entityCode: string): string;
  entityDetailHref(entityCode: string, recordId: string): string;
  entityNewHref(entityCode: string): string;
  entityRecordsApiHref?(entityCode: string): string | null;
  entitySavedViewsApiHref?(entityCode: string): string | null;
  entityFieldOptionsApiHrefBase?(entityCode: string): string | null;

  // App shell — each plane supplies its own PageFrame
  PageFrame: React.ComponentType<RuntimeListPageFrameProps>;
}

// ─── Full presenter props — resolved server-side ──────────────────────────────

export interface RuntimeListPresenterProps {
  entityCode:       string;
  entityName:       string;
  eyebrow:          string;
  description:      string;

  columns:          ResolvedColumn[];
  allColumns:       ResolvedColumn[];
  defaultColumns:   ResolvedColumn[];
  rows:             RuntimeRecordRow[];
  pagination?:      RuntimeListPagination;
  listState?:       RuntimeListRecordState;
  rawSearchParams:  RawSearchParams;
  search:           RuntimeListSearchPresenterState;
  lazyList:         RuntimeListLazyPresenterState;

  searchValue:      string;
  activeFilters:    ActiveFilterEntry[];
  activeSort:       SortEntry[];
  page:             number;
  pageSize:         number;
  viewMode:         ViewMode;
  density:          ViewDensity;
  groupField?:      string;
  listPresentation: RuntimeListPresentation;

  createHref:       string | null;
  toolbarActions:   ResolvedToolbarAction[];

  savedViews:       SavedView[];
  activeSavedViewId:string | null;
  accessScope:      RuntimeAccessScope;

  features:         RuntimeListFeatures;
  clientAdapter:    RuntimeListClientAdapter;

  filterableFields: RuntimeField[];
  sortableFields:   RuntimeField[];
  groupableFields:  RuntimeField[];

  slots?:           RuntimeListSlots;
}
