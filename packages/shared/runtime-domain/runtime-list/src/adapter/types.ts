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
  RuntimeListFeatureConfig,
  RuntimeListFeatureOverrides,
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
  RuntimeListFeatureConfig,
  RuntimeListFeatureOverrides,
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

export type RuntimeListFeatureSource =
  | "descriptor"
  | "entityOverride"
  | "adapterDefault"
  | "applicationDefault"
  | "safeDefault";

export interface RuntimeListFeatureDiagnostics {
  sources: { [K in keyof RuntimeListFeatures]: RuntimeListFeatureSource };
}

export interface RuntimeListFeatureResolution {
  features: RuntimeListFeatures;
  diagnostics: RuntimeListFeatureDiagnostics;
}

export type OrganizeControlName =
  | "search"
  | "filter"
  | "sort"
  | "group"
  | "columns"
  | "density"
  | "viewMode"
  | "savedViews";

const RUNTIME_LIST_VIEW_MODES: readonly ViewMode[] = ["list", "compact", "board", "dashboard", "excel"];
const RUNTIME_LIST_MAX_SORT_LEVELS = 5;
const RUNTIME_LIST_MAX_PAGE_SIZE = 500;

const RUNTIME_LIST_SAFE_DEFAULTS: RuntimeListFeatures = {
  savedViews:          false,
  bulkActions:         false,
  export:              false,
  import:              false,
  columnCustomization: false,
  grouping:            false,
  multiSort:           false,
  maxSortLevels:       1,
  viewModes:           ["list"],
  searchMode:          "both",
  maxPageSize:         RUNTIME_LIST_MAX_PAGE_SIZE,
};

/**
 * Normalize an optional feature configuration into the complete runtime
 * contract. Explicit false values are preserved by the object merge.
 */
export function normalizeRuntimeListFeatures(
  features: RuntimeListFeatureConfig = {},
  defaults: RuntimeListFeatureConfig = {},
): RuntimeListFeatures {
  const merged = {
    ...RUNTIME_LIST_SAFE_DEFAULTS,
    ...definedFeatureValues(defaults),
    ...definedFeatureValues(features),
  };
  const multiSort = merged.multiSort === true;
  return {
    savedViews:          merged.savedViews === true,
    bulkActions:         merged.bulkActions === true,
    export:              merged.export === true,
    import:              merged.import === true,
    columnCustomization: merged.columnCustomization === true,
    grouping:            merged.grouping === true,
    multiSort,
    maxSortLevels:       normalizeMaxSortLevels(merged.maxSortLevels, multiSort),
    viewModes:           normalizeViewModes(merged.viewModes),
    searchMode:          normalizeSearchMode(merged.searchMode),
    maxPageSize:         normalizeMaxPageSize(merged.maxPageSize),
  };
}

function definedFeatureValues(config: RuntimeListFeatureConfig): RuntimeListFeatureConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as RuntimeListFeatureConfig;
}

export interface ResolveRuntimeListFeaturesOptions {
  descriptor?:      Pick<RuntimeDescriptor, "listPresentation"> | null;
  adapterDefaults?: RuntimeListFeatureConfig;
  entityOverride?:  RuntimeListFeatureConfig | null;
  applicationDefaults?: RuntimeListFeatureConfig;
}

/**
 * Resolve list features in one place. Entity descriptor metadata has the
 * highest precedence, followed by an optional per-entity adapter override,
 * application/plane defaults, and finally safe runtime defaults.
 */
export function resolveRuntimeListFeatures({
  ...options
}: ResolveRuntimeListFeaturesOptions): RuntimeListFeatures {
  return resolveRuntimeListFeaturesWithDiagnostics(options).features;
}

/** Resolve the runtime contract together with the policy layer that supplied each value. */
export function resolveRuntimeListFeaturesWithDiagnostics({
  descriptor,
  adapterDefaults,
  entityOverride,
  applicationDefaults,
}: ResolveRuntimeListFeaturesOptions): RuntimeListFeatureResolution {
  const descriptorFeatures = descriptor?.listPresentation?.features ?? {};
  const mergedDefaults = {
    ...applicationDefaults,
    ...adapterDefaults,
    ...entityOverride,
  };

  // Size/complexity limits are ceilings, not feature toggles. A descriptor may
  // tighten an application policy but cannot raise its configured ceiling.
  const maxSortLevels = minimumConfiguredLimit([
    applicationDefaults?.maxSortLevels,
    adapterDefaults?.maxSortLevels,
    entityOverride?.maxSortLevels,
    descriptorFeatures.maxSortLevels,
  ]);
  const maxPageSize = minimumConfiguredLimit([
    applicationDefaults?.maxPageSize,
    adapterDefaults?.maxPageSize,
    entityOverride?.maxPageSize,
    descriptorFeatures.maxPageSize,
  ]);

  const features = normalizeRuntimeListFeatures(
    {
      ...descriptorFeatures,
      ...(maxSortLevels !== undefined ? { maxSortLevels } : {}),
      ...(maxPageSize !== undefined ? { maxPageSize } : {}),
    },
    {
      ...mergedDefaults,
    },
  );

  const sourceFor = (key: keyof RuntimeListFeatures): RuntimeListFeatureSource => {
    if (descriptorFeatures[key as keyof typeof descriptorFeatures] !== undefined) return "descriptor";
    if (entityOverride?.[key] !== undefined) return "entityOverride";
    if (adapterDefaults?.[key] !== undefined) return "adapterDefault";
    if (applicationDefaults?.[key] !== undefined) return "applicationDefault";
    return "safeDefault";
  };
  const limitSource = (key: "maxSortLevels" | "maxPageSize"): RuntimeListFeatureSource => {
    const candidates: Array<{ value: number | undefined; source: RuntimeListFeatureSource }> = [
      { value: descriptorFeatures[key], source: "descriptor" },
      { value: entityOverride?.[key], source: "entityOverride" },
      { value: adapterDefaults?.[key], source: "adapterDefault" },
      { value: applicationDefaults?.[key], source: "applicationDefault" },
    ];
    const configured = candidates.filter(
      (candidate): candidate is { value: number; source: RuntimeListFeatureSource } =>
        typeof candidate.value === "number" && Number.isFinite(candidate.value) && candidate.value > 0,
    );
    if (configured.length === 0) return "safeDefault";
    const minimum = Math.min(...configured.map((candidate) => candidate.value));
    return configured.find((candidate) => candidate.value === minimum)?.source ?? "safeDefault";
  };

  const sources: RuntimeListFeatureDiagnostics["sources"] = {
    savedViews:          sourceFor("savedViews"),
    bulkActions:         sourceFor("bulkActions"),
    export:              sourceFor("export"),
    import:              sourceFor("import"),
    columnCustomization: sourceFor("columnCustomization"),
    grouping:            sourceFor("grouping"),
    multiSort:           sourceFor("multiSort"),
    maxSortLevels:       features.multiSort ? limitSource("maxSortLevels") : sourceFor("multiSort"),
    viewModes:           descriptor?.listPresentation?.viewModes?.length
      ? "descriptor"
      : sourceFor("viewModes"),
    searchMode:          sourceFor("searchMode"),
    maxPageSize:         limitSource("maxPageSize"),
  };

  return { features, diagnostics: { sources } };
}

function minimumConfiguredLimit(values: Array<number | undefined>): number | undefined {
  const configured = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  return configured.length > 0 ? Math.min(...configured) : undefined;
}

function normalizeMaxSortLevels(value: number | undefined, multiSort: boolean): number {
  if (!multiSort) return 1;
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
  return Math.min(RUNTIME_LIST_MAX_SORT_LEVELS, Math.max(2, Math.trunc(value)));
}

function normalizeViewModes(value: ViewMode[] | undefined): ViewMode[] {
  if (!Array.isArray(value)) return [...RUNTIME_LIST_SAFE_DEFAULTS.viewModes];
  const modes = value.filter((mode, index) =>
    RUNTIME_LIST_VIEW_MODES.includes(mode) && value.indexOf(mode) === index,
  );
  return modes.length > 0 ? modes : [...RUNTIME_LIST_SAFE_DEFAULTS.viewModes];
}

function normalizeSearchMode(value: RuntimeListFeatures["searchMode"] | undefined): RuntimeListFeatures["searchMode"] {
  return value === "server" || value === "client" || value === "both" ? value : "both";
}

function normalizeMaxPageSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return RUNTIME_LIST_SAFE_DEFAULTS.maxPageSize;
  }
  return Math.min(RUNTIME_LIST_MAX_PAGE_SIZE, Math.max(1, Math.trunc(value)));
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

  /** Optional per-entity feature overrides resolved after the descriptor loads. */
  resolveListFeatures?(
    entityCode: string,
    descriptor: RuntimeDescriptor,
  ): RuntimeListFeatureConfig | null | Promise<RuntimeListFeatureConfig | null>;

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
    options?:         RuntimeListRecordFetchOptions,
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

  // Optional app override. The shared runtime-list frame is the default.
  PageFrame?: React.ComponentType<RuntimeListPageFrameProps>;
}

export interface RuntimeListRecordFetchOptions {
  /** Restricts expensive display-value hydration to the active presentation. */
  visibleFieldNames?: readonly string[];
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
  featureDiagnostics: RuntimeListFeatureDiagnostics;
  clientAdapter:    RuntimeListClientAdapter;

  filterableFields: RuntimeField[];
  sortableFields:   RuntimeField[];
  groupableFields:  RuntimeField[];

  slots?:           RuntimeListSlots;
}
