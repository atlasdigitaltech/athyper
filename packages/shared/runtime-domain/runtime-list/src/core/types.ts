// ─── Descriptor ───────────────────────────────────────────────────────────────
// Inlined types — zero @athyper/product/* imports.
// packages/apps/neon converts MetaEntityRuntimeDescriptor → RuntimeDescriptor.

export interface RuntimeDescriptor {
  entityCode:   string;
  entityName:   string;
  routeSlug:    string;
  source:       { tableSchema: string; tableName: string };
  capabilities: { canCreate: boolean };
  descriptorHash?: string;
  cachePolicy?: RuntimeListCachePolicy;
  accessScope?: RuntimeAccessScopeConfig;
  listPresentation?: RuntimeListPresentationConfig;
  fields:       RuntimeField[];
  operations:   RuntimeOperation[];
  extensions?:  Record<string, unknown>;
}

export interface RuntimeListCachePolicy {
  mode: "disabled" | "memory" | "stale_while_revalidate";
  freshForSeconds: number;
  retainForSeconds: number;
  prefetch: "none" | "intent" | "viewport" | "eager";
  restoreScroll: boolean;
  invalidateOnMutation: boolean;
  maxQueriesPerEntity: number;
  maxRowsPerQuery: number;
  storage: "memory" | "session" | "persistent";
  source: "platform" | "entity_class" | "entity" | "tenant";
}

export type RuntimeScopePlane = "neon" | "mesh" | "admin";
export type RuntimeTenantScopeMode = "tenant" | "tenant_overlay" | "global" | "system";
export type RuntimeScopeFieldRole =
  | "tenant"
  | "legalEntity"
  | "businessEntity"
  | "companyCode"
  | "buyerOrg"
  | "supplierOrg";

export interface RuntimeAccessScopeConfig {
  mode?: RuntimeTenantScopeMode;
  fields?: Partial<Record<RuntimeScopeFieldRole, string>>;
  requiredFields?: RuntimeScopeFieldRole[];
  protectedFields?: string[];
}

export interface RuntimeField {
  name:          string;
  columnName?:   string;
  label:         string;
  dataType:      string;
  uiType?:       string;
  options?:      RuntimeFilterOption[];
  filter?:       RuntimeFieldFilter;
  editor?:       RuntimeFieldEditor;
  display?:      RuntimeFieldDisplay;
  semanticRole?: string;
  scopeRole?:    RuntimeScopeFieldRole;
  isVisible?:    boolean;
  isSearchable?: boolean;
  isFilterable?: boolean;
  isSortable?:   boolean;
  isGroupable?:  boolean;
  isAggregatable?: boolean;
  compactVisible?: boolean;
  excelVisible?:   boolean;
  aggregation?:    RuntimeColumnAggregation | null;
  isPii?:        boolean;
  order:         number;
}

export type RuntimeFilterKind =
  | "text"
  | "number"
  | "money"
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "lookup"
  | "reference"
  | "json"
  | "presence";

export type RuntimeFilterOperator =
  | "eq"
  | "contains"
  | "in"
  | "not_in"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "between"
  | "relative"
  | "empty"
  | "not_empty";

export interface RuntimeFilterOption {
  value:       string;
  label:       string;
  description?:string;
  disabled?:   boolean;
}

export type RuntimeFilterOptionSource =
  | {
      kind:    "static";
      options: RuntimeFilterOption[];
    }
  | {
      kind:            "lookup";
      domainCode?:     string;
      valueField?:     "code" | "id";
      includeInactive?:boolean;
    }
  | {
      kind:            "reference";
      entity:          string;
      valueField:      string;
      labelField:      string;
      codeField?:      string;
      descriptionField?: string;
      includeInactive?:boolean;
    };

export interface RuntimeFilterSection {
  key:    string;
  label:  string;
  order?: number;
}

export interface RuntimeFieldFilter {
  kind:          RuntimeFilterKind;
  operators?:     RuntimeFilterOperator[];
  optionSource?:  RuntimeFilterOptionSource;
  placeholder?:   string;
  quick?:         boolean;
  quickLabel?:    string;
  quickOrder?:    number;
  valueLabelMap?: Record<string, string>;
  section?:       RuntimeFilterSection;
}

export interface RuntimeFieldEditor {
  control:     string;
  allowClear?: boolean;
  placeholder?:string;
  search?:     boolean;
}

export interface RuntimeFieldDisplay {
  renderer: string;
  fallback?: string;
  format?:   string;
  valueField?:string;
  labelField?:string;
}

export interface RuntimeOperation {
  key:             string;
  label?:          string;
  permissionCode:  string;
  surface:         "LIST" | "DETAIL" | "BOTH";
  placement:       "PRIMARY" | "TOOLBAR" | "OVERFLOW";
  handlerType:     "NAVIGATE" | "API" | "MODAL" | "INLINE";
  handlerTarget?:  string;
  intent?:         string;
  enabled:         boolean;
  isRecordRequired:boolean;
  disabledReason?: string;
}

// ─── Record shapes ─────────────────────────────────────────────────────────────

export type RuntimeRecordRow = Record<string, unknown> & { id?: string | number | null };

export interface RuntimeListRecordState {
  status:   "ready" | "unavailable";
  message?: string;
}

export interface RuntimeListPagination {
  page?:       number;
  pageSize?:   number;
  total?:      number;
  totalPages?: number;
}

// ─── Progressive search ────────────────────────────────────────────────────

export type RuntimeListSearchScope = "loaded" | "all";
export type RuntimeListSearchDefaultScope = "auto" | RuntimeListSearchScope;

export interface RuntimeListSearchField {
  name:       string;
  columnName?:string;
  label?:     string;
  weight?:    number;
}

export interface RuntimeListSearchControls {
  defaultScope:                 RuntimeListSearchDefaultScope;
  minQueryLength:               number;
  loadedSearchThreshold:        number;
  autoSearchAllOnEmpty:         boolean;
  autoSearchAllDebounceMs:      number;
  manualSearchAllDebounceMs:    number;
  queryStabilityMs:             number;
  serverSearchTimeoutMs:        number;
  fuzzySearch:                  boolean;
  visitedPageCache:             boolean;
  serverResultCacheTtlSeconds:  number;
}

export interface RuntimeListSearchPresenterState {
  enabled:       boolean;
  initialQuery:  string;
  initialScope?: RuntimeListSearchScope;
  controls:      RuntimeListSearchControls;
  fields:        RuntimeListSearchField[];
  isFullyLoaded: boolean;
  loadedCount:   number;
  total?:        number;
}

// ─── Hybrid lazy list controls ───────────────────────────────────────────────

export interface RuntimeListLazyControls {
  lazyLoadEnabled:              boolean;
  lazyLoadPageSize:             number;
  pageSizeSelectorEnabled:      boolean;
  defaultPageSize:              number;
  lazyPrefetchDistancePx:       number;
  loadedPageCacheTtlSeconds:    number;
  maxLoadedRows:                number;
}

export interface RuntimeListLazyPresenterState {
  enabled:          boolean;
  initialRows:      RuntimeRecordRow[];
  initialPagination?: RuntimeListPagination;
  page:             number;
  pageSize:         number;
  rawSearchParams:  RawSearchParams;
  cacheKey:         string;
  descriptorHash:   string;
  scopeFingerprint: string;
  cachePolicy:      RuntimeListCachePolicy;
  controls:         RuntimeListLazyControls;
}

// ─── URL / query state ─────────────────────────────────────────────────────────
// Mirrors EntityListQueryState from @athyper/api-contracts/entity-list.
// The P key map below MUST stay identical to useEntityListUrl.ts constant P.

export const LIST_URL_PARAMS = {
  SEARCH:        "q",
  SEARCH_SCOPE:  "search_scope",
  SEARCH_MODE:   "search_mode",
  SORT:          "sort",
  FILTER_PFX:    "filter.",
  GROUP:         "group",
  PAGE:          "page",
  PAGE_SIZE:     "page_size",
  VIEW_MODE:     "view",
  COLUMNS:       "cols",
  DENSITY:       "density",
  FACETS:        "facets",
  PINNED:        "pinned",
  VIEW_ID:       "vid",
  BASE_VIEW_ID:  "bvid",
} as const;

export type ViewMode    = "list" | "compact" | "board" | "dashboard" | "excel";
export type ViewDensity = "compact" | "comfortable" | "spacious";
export type RuntimeColumnAggregation = "sum" | "count" | "avg" | "min" | "max";

/**
 * Optional entity-level list feature overrides.
 *
 * This is intentionally a partial configuration.  The adapter/application
 * policy supplies the fallback values and the runtime resolver produces the
 * complete `RuntimeListFeatures` contract consumed by the UI.
 */
export interface RuntimeListFeatureConfig {
  savedViews?:          boolean;
  bulkActions?:         boolean;
  export?:              boolean;
  import?:              boolean;
  columnCustomization?: boolean;
  grouping?:            boolean;
  multiSort?:           boolean;
  maxSortLevels?:       number;
  viewModes?:           ViewMode[];
  searchMode?:          "server" | "client" | "both";
  maxPageSize?:         number;
}

/**
 * Entity presentation overrides intentionally omit `viewModes`: the existing
 * `listPresentation.viewModes` field is the canonical entity view-mode policy.
 */
export type RuntimeListFeatureOverrides = Omit<RuntimeListFeatureConfig, "viewModes">;

export interface RuntimeCompactPresentationConfig {
  titleField?:    string;
  subtitleField?: string;
  bottomFields?:  string[];
  fields?:        string[];
}

export interface RuntimeExcelPresentationConfig {
  columns?:      string[];
  aggregations?: Partial<Record<string, RuntimeColumnAggregation>>;
}

export interface RuntimeListPresentationConfig {
  defaultViewMode?: ViewMode;
  viewModes?:       ViewMode[];
  /** Entity-specific list UI feature overrides from display_config.list_features. */
  features?:        RuntimeListFeatureOverrides;
  compact?:         RuntimeCompactPresentationConfig;
  excel?:           RuntimeExcelPresentationConfig;
}

export interface RuntimeCompactPresentation {
  titleField:     string;
  subtitleField?: string;
  bottomFields:   string[];
  fields:         string[];
}

export interface RuntimeExcelPresentation {
  columns:      string[];
  aggregations: Partial<Record<string, RuntimeColumnAggregation>>;
}

export interface RuntimeListPresentation {
  defaultViewMode: ViewMode;
  viewModes:       ViewMode[];
  compact:         RuntimeCompactPresentation;
  excel:           RuntimeExcelPresentation;
}

export interface SortEntry {
  key: string;
  dir: "asc" | "desc";
}

export interface RuntimeListState {
  search?:         string;
  searchScope?:    RuntimeListSearchScope;
  searchMode?:     "server" | "client";
  sort?:           SortEntry[];
  filters?:        Record<string, string[]>;
  group?:          string;
  page?:           number;
  pageSize?:       number;
  viewMode?:       ViewMode;
  columns?:        string[];
  density?:        ViewDensity;
  facets?:         "cheap" | "all";
  pinnedCols?:     string[];
  savedViewId?:    string;
  baseSavedViewId?:string;
}

export type SaveableListState = Omit<
  RuntimeListState,
  "page" | "pageSize" | "savedViewId" | "baseSavedViewId"
>;

export type RuntimeScopePredicate =
  | { op: "eq"; field: string; value: string }
  | { op: "in"; field: string; values: string[] }
  | { op: "isNull"; field: string }
  | { op: "and"; items: RuntimeScopePredicate[] }
  | { op: "or"; items: RuntimeScopePredicate[] };

export interface RuntimeAccessScopeLabel {
  key:   string;
  label: string;
  value: string;
}

export interface RuntimeAccessScope {
  plane:           RuntimeScopePlane;
  mode:            RuntimeTenantScopeMode;
  status:          "ready" | "denied";
  source:          "resolved" | "delegated";
  predicate?:      RuntimeScopePredicate;
  protectedFields: string[];
  labels:          RuntimeAccessScopeLabel[];
  deniedReason?:   string;
}

export interface RuntimeAccessContext {
  tenantId?:                string | null;
  systemTenantId?:          string | null;
  loginLegalEntityId?:      string | null;
  loginBusinessEntityIds?:  string[];
  loginCompanyCodeIds?:     string[];
  accessibleBuyerOrgIds?:   string[];
  accessibleSupplierOrgIds?:string[];
  allowGlobal?:             boolean;
  allowSystem?:             boolean;
  labels?:                  Partial<Record<RuntimeScopeFieldRole, string>>;
}

// ─── Resolved / presenter shapes ──────────────────────────────────────────────

export interface ResolvedColumn {
  name:         string;
  label:        string;
  dataType:     string;
  uiType?:      string;
  columnName?:   string;
  display?:      RuntimeFieldDisplay;
  isSortable:   boolean;
  isFilterable: boolean;
  compactVisible?: boolean;
  excelVisible?:   boolean;
  aggregation?:    RuntimeColumnAggregation | null;
}

export interface ActiveFilterEntry {
  fieldName: string;
  label:     string;
  value:     string;
}

export interface ResolvedToolbarAction {
  key:            string;
  label:          string;
  href:           string;
  intent:         string;
  disabled:       boolean;
  disabledReason?:string;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;
