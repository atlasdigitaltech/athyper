import type {
  RuntimeListServerAdapter,
  RuntimeListPresenterProps,
  RuntimeListClientAdapter,
  SavedView,
  ResolvedToolbarAction,
} from "../adapter/types";
import { resolveRuntimeListFeaturesWithDiagnostics } from "../adapter/types";
import type {
  RawSearchParams,
  RuntimeAccessScope,
  RuntimeDescriptor,
  RuntimeField,
  RuntimeFilterKind,
  RuntimeFilterOperator,
  RuntimeOperation,
  RuntimeListState,
  SortEntry,
} from "./types";
import { LIST_URL_PARAMS as P } from "./types";
import {
  parseListSearchParams,
  mergeSavedViewState,
  effectiveStateToRawParams,
  resolveActiveFilters,
  resolvePageSize,
} from "./url-state";
import {
  createDelegatedAccessScope,
  removeProtectedScopeFilters,
} from "./access-scope";
import {
  resolveColumns,
  resolveAllColumns,
  resolveFilterableFields,
  resolveSortableFields,
  resolveGroupableFields,
} from "./columns";
import {
  normalizeSearchControls,
  resolveSearchFields,
  resolveSearchMinLength,
} from "./search";
import {
  buildRuntimeListBrowserCacheKey,
  buildRuntimeListScopeFingerprint,
  normalizeLazyListControls,
} from "./lazy-list";
import {
  buildDefaultListPresentation,
  isRuntimeViewDensity,
  isRuntimeViewMode,
  resolveListPresentation,
  resolveRuntimeDensity,
  resolveRuntimeViewMode,
  resolveRuntimeViewModes,
} from "./list-presentation";
import { runtimeListText } from "./resources";
import { DEFAULT_RUNTIME_LIST_CACHE_POLICY } from "../browser-cache/runtime-list-browser-cache";

export async function resolvePresenterProps(
  adapter:        RuntimeListServerAdapter,
  entityCode:     string,
  rawSearchParams:RawSearchParams,
): Promise<RuntimeListPresenterProps> {
  // 1. Descriptor first — required for column resolution and scope filters
  const descriptor = await adapter.fetchDescriptor(entityCode);
  if (!descriptor) {
    return buildUnavailableProps(adapter, entityCode, rawSearchParams);
  }
  // 2. Parse URL state
  const urlState = parseListSearchParams(rawSearchParams);

  // 3. Start every descriptor-dependent operation immediately. Search/list
  // configuration still receives the resolved access scope, but it no longer
  // waits for saved-view I/O before it can begin.
  const accessScopePromise = adapter.resolveAccessScope?.(entityCode, descriptor) ??
    Promise.resolve(createDelegatedAccessScope(adapter.plane, descriptor));
  const searchControlsPromise = accessScopePromise.then((accessScope) =>
    adapter.resolveSearchControls?.(entityCode, descriptor, accessScope) ?? Promise.resolve(null));
  const lazyListControlsPromise = accessScopePromise.then((accessScope) =>
    adapter.resolveLazyListControls?.(entityCode, descriptor, accessScope) ?? Promise.resolve(null));

  // The descriptor's explicit list feature metadata wins over adapter defaults.
  const [entityFeatureOverrides, savedViews, accessScope] = await Promise.all([
    adapter.resolveListFeatures?.(entityCode, descriptor) ?? Promise.resolve(null),
    adapter.fetchSavedViews?.(entityCode) ?? Promise.resolve([] as SavedView[]),
    accessScopePromise,
  ]);
  const featureResolution = resolveRuntimeListFeaturesWithDiagnostics({
    descriptor,
    adapterDefaults: adapter.features,
    entityOverride: entityFeatureOverrides,
  });
  const rawFeatures = featureResolution.features;
  const implicitDefaultView = shouldApplyImplicitDefaultView(rawSearchParams, urlState)
    ? findPrincipalDefaultSavedView(savedViews)
    : null;
  const requestedSavedViewId = urlState.savedViewId === SYSTEM_VIEW_ID ? undefined : urlState.savedViewId;
  const effectiveSavedViewId = requestedSavedViewId ?? implicitDefaultView?.id;
  const materializedSavedView = effectiveSavedViewId
    ? savedViews.find((view) => view.id === effectiveSavedViewId)
    : undefined;
  const savedState = materializedSavedView?.state ?? (effectiveSavedViewId
    ? await adapter.fetchSavedView?.(effectiveSavedViewId, entityCode) ?? null
    : null);
  const activeSavedViewId = savedState ? effectiveSavedViewId ?? null : null;

  // 4. Merge saved view state if vid param present
  const effectiveState = mergeSavedViewState(urlState, savedState);
  if (accessScope.status === "denied") {
    return buildAccessDeniedProps(adapter, entityCode, rawSearchParams, accessScope);
  }
  const scopedState = removeProtectedScopeFilters(effectiveState, accessScope.protectedFields);
  // Lazy-list controls determine the page size and are therefore the only UI
  // configuration that must resolve before the records request can start.
  const rawLazyListControls = await lazyListControlsPromise;
  const lazyListControls = normalizeLazyListControls(rawLazyListControls);
  const searchFields = resolveSearchFields(descriptor);

  // 5. Resolve pagination
  const page     = Math.max(1, scopedState.page ?? 1);
  const requestedPageSize = scopedState.pageSize ?? lazyListControls.defaultPageSize;
  const pageSize = Math.min(resolvePageSize(requestedPageSize), rawFeatures.maxPageSize);

  // 6. Resolve active view mode — gate against adapter's allowed modes
  const protectedFieldSet = new Set(accessScope.protectedFields);
  const stripProtected = <T extends { name: string }>(cols: T[]): T[] =>
    protectedFieldSet.size > 0 ? cols.filter((c) => !protectedFieldSet.has(c.name)) : cols;
  const filterableFields = stripProtected(resolveFilterableFields(descriptor));
  const sortableFields   = stripProtected(resolveSortableFields(descriptor));
  const groupableFields  = stripProtected(resolveGroupableFields(descriptor));
  const activeSort = sanitizeSortEntries(scopedState.sort ?? [], sortableFields, rawFeatures.maxSortLevels);
  const activeFiltersState = sanitizeFilterEntries(scopedState.filters, filterableFields);

  // 7. Resolve columns (PII guard applied inside resolveColumns)
  // Additionally strip any protected scope fields so ?cols= injection cannot surface them.
  const defaultColumns = stripProtected(resolveColumns(descriptor, undefined));
  const columns        = stripProtected(resolveColumns(descriptor, scopedState.columns));
  const allColumns     = stripProtected(resolveAllColumns(descriptor));
  const listPresentation = resolveListPresentation(descriptor, columns, allColumns, defaultColumns);
  const featureViewModes = resolveRuntimeViewModes(rawFeatures.viewModes, listPresentation.viewModes);
  const features = { ...rawFeatures, viewModes: featureViewModes };
  const rawMode = isRuntimeViewMode(scopedState.viewMode)
    ? scopedState.viewMode
    : listPresentation.defaultViewMode;
  const viewMode = resolveRuntimeViewMode(rawMode, featureViewModes);
  const density = resolveRuntimeDensity(scopedState.density);
  const visibleColumnNames = new Set(columns.map((column) => column.name));
  const groupField = rawFeatures.grouping &&
    scopedState.group &&
    visibleColumnNames.has(scopedState.group) &&
    groupableFields.some((field) => field.name === scopedState.group)
      ? scopedState.group
      : undefined;
  const sanitizedState: RuntimeListState = {
    ...scopedState,
    filters:  activeFiltersState,
    sort:     activeSort.length > 0 ? activeSort : undefined,
    group:    groupField,
    viewMode: viewMode === "list" ? undefined : viewMode,
    density:  isRuntimeViewDensity(scopedState.density) ? density : undefined,
  };

  // 8. Field label map for filter chip display
  const fieldLabels = Object.fromEntries(filterableFields.map((f) => [f.name, f.label]));
  const activeFilters = resolveActiveFilters(sanitizedState, fieldLabels);

  // 9. Fetch records — pass effective (merged) params so saved-view state is honoured.
  //    Raw URL params are intentionally NOT used here; effectiveState already won the
  //    URL-vs-saved-view merge above (URL wins). The adapter translates param keys as needed.
  const presenterParams = effectiveStateToRawParams({ ...sanitizedState, page, pageSize });
  if (activeSavedViewId) {
    presenterParams[P.BASE_VIEW_ID] = activeSavedViewId;
  }
  const recordFetchState = sanitizedState.search && (
    sanitizedState.searchScope === "loaded" ||
    sanitizedState.searchMode === "client"
  )
    ? { ...sanitizedState, search: undefined, page, pageSize }
    : { ...sanitizedState, page, pageSize };
  const recordFetchParams = effectiveStateToRawParams(recordFetchState);
  // Runtime-list currently consumes legacy page/totalPages pagination. Keep
  // the initial server render on the same contract as its lazy page requests.
  recordFetchParams["query_v1"] = "0";
  const responsePromise = adapter.fetchRecords(
    entityCode,
    recordFetchParams,
    descriptor,
    accessScope,
    { visibleFieldNames: columns.map((column) => column.name) },
  );
  const [response, rawSearchControls] = await Promise.all([
    responsePromise,
    searchControlsPromise,
  ]);
  const baseSearchControls = normalizeSearchControls(rawSearchControls);
  const searchControls = normalizeSearchControls({
    ...baseSearchControls,
    minQueryLength: resolveSearchMinLength(descriptor, baseSearchControls.minQueryLength),
  });
  const isFullyLoaded = response.isFullyLoaded ?? inferFullyLoaded(response.records.length, response.pagination, page);
  const scopeFingerprint = buildRuntimeListScopeFingerprint(accessScope);
  const cachePolicy = descriptor.cachePolicy ?? DEFAULT_RUNTIME_LIST_CACHE_POLICY;

  // 10. Resolve toolbar actions from operations
  const createHref     = resolveCreateHref(adapter, descriptor);
  const toolbarActions = resolveToolbarActions(adapter, descriptor);

  // 11. Build serializable client adapter (passed to islands as props)
  const clientAdapter: RuntimeListClientAdapter = {
    entityCode,
    features,
    listBaseHref:   adapter.entityListHref(entityCode),
    detailHrefBase: adapter.entityDetailHref(entityCode, "").replace(/\/$/, ""),
    newHref:        createHref,
    // When searchMode is "client", suppress the records API href so islands never
    // render or trigger the "Search in all records" server-search UI.
    recordsApiHref: features.searchMode !== "client"
      ? (adapter.entityRecordsApiHref?.(entityCode) ?? null)
      : null,
    savedViewsApiHref: adapter.entitySavedViewsApiHref?.(entityCode) ?? null,
    fieldOptionsApiHrefBase: adapter.entityFieldOptionsApiHrefBase?.(entityCode) ?? null,
  };

  return {
    entityCode,
    entityName:   descriptor.entityName,
    eyebrow:      `${descriptor.source.tableSchema} / ${descriptor.entityCode}`,
    description:  buildDescription(descriptor, response.records.length, response.pagination?.total),

    columns,
    allColumns,
    defaultColumns,
    rows:         response.records,
    pagination:   response.pagination,
    listState:    response.state,
    rawSearchParams: presenterParams,
    search: {
      // "client" mode means local-only search; "server" means server-only.
      // Both "both" and "client" enable the local search input, but only "both"
      // and "server" should surface the "Search in all records" (server search) trigger.
      enabled:       features.searchMode !== "server" && searchFields.length > 0,
      initialQuery:  sanitizedState.search ?? "",
      initialScope:  sanitizedState.searchScope,
      controls:      searchControls,
      fields:        searchFields,
      isFullyLoaded,
      loadedCount:   response.records.length,
      total:         response.pagination?.total,
    },
    lazyList: {
      // Phase 1 lazy append starts only from page 1; deep-linked later pages keep normal pagination.
      enabled:           lazyListControls.lazyLoadEnabled && (viewMode === "list" || viewMode === "compact" || viewMode === "excel") && page === 1 && Boolean(clientAdapter.recordsApiHref),
      initialRows:       response.records,
      initialPagination: response.pagination,
      page,
      pageSize,
      rawSearchParams:   presenterParams,
      cacheKey:          buildRuntimeListBrowserCacheKey(entityCode, presenterParams, pageSize),
      descriptorHash:    descriptor.descriptorHash ?? `unversioned:${descriptor.entityCode}`,
      scopeFingerprint,
      cachePolicy,
      controls: {
        ...lazyListControls,
        lazyLoadPageSize: pageSize,
        maxLoadedRows: Math.min(lazyListControls.maxLoadedRows, cachePolicy.maxRowsPerQuery),
      },
    },

    searchValue:  sanitizedState.search ?? "",
    activeFilters,
    activeSort,
    page,
    pageSize,
    viewMode,
    density,
    groupField,
    listPresentation,

    createHref,
    toolbarActions,

    savedViews,
    activeSavedViewId,
    accessScope,

    features,
    featureDiagnostics: featureResolution.diagnostics,
    clientAdapter,

    filterableFields,
    sortableFields,
    groupableFields,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferFullyLoaded(
  rowCount:   number,
  pagination:RuntimeListPresenterProps["pagination"],
  page:      number,
): boolean {
  if (page !== 1) return false;
  if (typeof pagination?.total !== "number") return false;
  return rowCount >= pagination.total;
}

function buildEmptySearchState(initialQuery: string): RuntimeListPresenterProps["search"] {
  return {
    enabled:       false,
    initialQuery,
    controls:      normalizeSearchControls(null),
    fields:        [],
    isFullyLoaded: false,
    loadedCount:   0,
  };
}

function resolveCreateHref(
  adapter:    RuntimeListServerAdapter,
  descriptor: RuntimeDescriptor,
): string | null {
  if (!descriptor.capabilities.canCreate) return null;

  // Look for an explicit create-like operation; metadata can route it to a
  // dedicated intake experience such as business partner supplier creation.
  const createOp = descriptor.operations.find(isCreateOperation);

  if (createOp) {
    // A matching op was found — respect its enabled/disabled state.
    if (!createOp.enabled || createOp.disabledReason) return null;
    if (createOp.handlerType === "NAVIGATE" && createOp.handlerTarget?.startsWith("/")) {
      return expandCreateHrefTemplate(createOp.handlerTarget, descriptor);
    }
  }

  // No explicit create op — fall through to the adapter's default new-record href.
  const redirectHref = resolveCreateRedirectHref(descriptor);
  if (redirectHref) return redirectHref;

  return adapter.entityNewHref(descriptor.entityCode);
}

function resolveToolbarActions(
  adapter:    RuntimeListServerAdapter,
  descriptor: RuntimeDescriptor,
): ResolvedToolbarAction[] {
  const listHref = adapter.entityListHref(descriptor.entityCode);
  return descriptor.operations
    .filter((op) => op.surface === "LIST" || op.surface === "BOTH")
    .filter((op) => op.placement === "PRIMARY" || op.placement === "TOOLBAR")
    .filter((op) => !op.isRecordRequired)
    .filter((op) => !isCreateOperation(op))
    // API/MODAL/INLINE ops are client-side; only NAVIGATE has a static href.
    .filter((op) => op.handlerType === "NAVIGATE")
    .slice(0, 3)
    .map((op) => ({
      key:            op.key,
      label:          op.label ?? humanizePermCode(op.permissionCode),
      // Use handlerTarget when it's an absolute path, else fall back to list href.
      href:           op.handlerTarget?.startsWith("/") ? op.handlerTarget : listHref,
      intent:         op.intent ?? "default",
      disabled:       !op.enabled || Boolean(op.disabledReason),
      disabledReason: op.disabledReason,
    }));
}

function isCreateOperation(op: RuntimeOperation): boolean {
  if (op.isRecordRequired) return false;
  if (op.surface !== "LIST" && op.surface !== "BOTH") return false;
  return isCreatePermissionCode(op.permissionCode);
}

function isCreatePermissionCode(permissionCode: string): boolean {
  const tokens = new Set(
    permissionCode
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .split("_")
      .filter(Boolean),
  );
  return (
    tokens.has("create") ||
    tokens.has("new") ||
    tokens.has("insert") ||
    tokens.has("add")
  );
}

function resolveCreateRedirectHref(descriptor: RuntimeDescriptor): string | null {
  const displayConfig = readRecord(descriptor.extensions?.["displayConfig"]);
  const redirect = readRecord(displayConfig?.["create_redirect"]);
  const hrefTemplate = redirect?.["href_template"];
  if (typeof hrefTemplate !== "string" || hrefTemplate.trim().length === 0) {
    return null;
  }
  return expandCreateHrefTemplate(hrefTemplate, descriptor);
}

function expandCreateHrefTemplate(template: string, descriptor: RuntimeDescriptor): string {
  return template
    .replaceAll("{entity_code}", descriptor.entityCode)
    .replaceAll("{entityCode}", descriptor.entityCode)
    .replaceAll("{entity}", descriptor.routeSlug);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function buildDescription(
  descriptor: RuntimeDescriptor,
  rowCount:   number,
  total?:     number,
): string {
  const count  = total ?? rowCount;
  const source = `${descriptor.source.tableSchema}.${descriptor.source.tableName}`;
  return runtimeListText.summary.recordsAndSource(count, source);
}

function humanizePermCode(code: string): string {
  const parts = code.split(/[.:_/-]+/).filter(Boolean);
  const last  = parts.at(-1) ?? code;
  return last.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/_/g, " ");
}

function sanitizeSortEntries(
  entries:        SortEntry[],
  sortableFields: RuntimeDescriptor["fields"],
  maxSortLevels:  number,
): SortEntry[] {
  const sortableNames = new Set(sortableFields.map((field) => field.name));
  const seen = new Set<string>();
  const clean: SortEntry[] = [];
  for (const entry of entries) {
    if (!sortableNames.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    clean.push({
      key: entry.key,
      dir: entry.dir === "desc" ? "desc" : "asc",
    });
    if (clean.length >= maxSortLevels) break;
  }
  return clean;
}

function sanitizeFilterEntries(
  filters:          RuntimeListState["filters"],
  filterableFields: RuntimeField[],
): RuntimeListState["filters"] {
  if (!filters) return undefined;
  const fieldByName = new Map(filterableFields.map((field) => [field.name, field] as const));
  const clean: NonNullable<RuntimeListState["filters"]> = {};
  for (const [field, values] of Object.entries(filters)) {
    const runtimeField = fieldByName.get(field);
    if (!runtimeField) continue;
    const rawValues = Array.isArray(values) ? values : [];
    const cleanValues = rawValues.filter((value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      isFilterValueAllowed(runtimeField, value.trim()),
    );
    if (cleanValues.length > 0) clean[field] = cleanValues;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function isFilterValueAllowed(field: RuntimeField, value: string): boolean {
  const operator = operatorForFilterValue(field, value);
  return operator ? allowsFilterOperator(field, operator) : false;
}

function allowsFilterOperator(field: RuntimeField, operator: RuntimeFilterOperator): boolean {
  const operators = field.filter?.operators;
  return !operators?.length || operators.includes(operator);
}

function operatorForFilterValue(
  field: RuntimeField,
  value: string,
): RuntimeFilterOperator | null {
  if (value === "null") return "empty";
  if (value === "notnull") return "not_empty";
  if (value.startsWith("between:")) return "between";
  if (value.startsWith("not_in:")) return "not_in";
  if (value.startsWith("in:")) return "in";
  if (value.startsWith(">=")) return "gte";
  if (value.startsWith("<=")) return "lte";
  if (value.startsWith(">")) return "gt";
  if (value.startsWith("<")) return "lt";
  if (value.startsWith("@")) return "relative";
  if (value.startsWith("~")) return "contains";
  return defaultBareValueOperator(runtimeFilterKind(field));
}

function defaultBareValueOperator(kind: RuntimeFilterKind): RuntimeFilterOperator {
  return kind === "enum" || kind === "lookup" || kind === "reference" ? "in" : "eq";
}

function runtimeFilterKind(field: RuntimeField): RuntimeFilterKind {
  return field.filter?.kind ?? fallbackFilterKind(field);
}

function fallbackFilterKind(field: RuntimeField): RuntimeFilterKind {
  const dataType = field.dataType.toLowerCase();
  if (dataType === "boolean" || dataType === "bool") return "boolean";
  if (dataType === "date") return "date";
  if (dataType === "datetime" || dataType === "timestamp" || dataType === "timestamptz") return "datetime";
  if (["integer", "bigint", "decimal", "numeric", "number"].includes(dataType)) return "number";
  if (dataType === "money") return "money";
  if (dataType === "enum" || dataType === "lifecycle_state") return "enum";
  if (dataType === "json" || dataType === "jsonb") return "json";
  return "text";
}

const SYSTEM_VIEW_ID = "system";

const IMPLICIT_DEFAULT_BLOCKING_PARAMS = [
  P.SEARCH,
  P.SEARCH_SCOPE,
  P.SEARCH_MODE,
  P.SORT,
  P.GROUP,
  P.VIEW_MODE,
  P.COLUMNS,
  P.DENSITY,
  P.FACETS,
  P.PINNED,
  P.VIEW_ID,
  P.BASE_VIEW_ID,
] as const;

function shouldApplyImplicitDefaultView(
  rawSearchParams: RawSearchParams,
  urlState:        RuntimeListState,
): boolean {
  if (urlState.savedViewId) return false;
  return !Object.entries(rawSearchParams).some(([key, value]) => (
    (IMPLICIT_DEFAULT_BLOCKING_PARAMS.includes(key as typeof IMPLICIT_DEFAULT_BLOCKING_PARAMS[number]) ||
      key.startsWith(P.FILTER_PFX)) &&
    hasParamValue(value)
  ));
}

function findPrincipalDefaultSavedView(savedViews: SavedView[]): SavedView | undefined {
  return savedViews.find((view) => view.is_default);
}

function hasParamValue(value: string | string[] | undefined): boolean {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim().length > 0;
}

async function buildAccessDeniedProps(
  adapter:        RuntimeListServerAdapter,
  entityCode:     string,
  rawSearchParams:RawSearchParams,
  accessScope:    RuntimeAccessScope,
): Promise<RuntimeListPresenterProps> {
  const urlState = parseListSearchParams(rawSearchParams);
  const featureResolution = resolveRuntimeListFeaturesWithDiagnostics({ adapterDefaults: adapter.features });
  const features = featureResolution.features;
  const clientAdapter: RuntimeListClientAdapter = {
    entityCode,
    features,
    listBaseHref:   adapter.entityListHref(entityCode),
    detailHrefBase: adapter.entityDetailHref(entityCode, "").replace(/\/$/, ""),
    newHref:        null,
    recordsApiHref: adapter.entityRecordsApiHref?.(entityCode) ?? null,
    savedViewsApiHref: adapter.entitySavedViewsApiHref?.(entityCode) ?? null,
    fieldOptionsApiHrefBase: adapter.entityFieldOptionsApiHrefBase?.(entityCode) ?? null,
  };
  return {
    entityCode,
    entityName:       entityCode,
    eyebrow:          entityCode,
    description:      "",
    columns:          [],
    allColumns:       [],
    defaultColumns:   [],
    rows:             [],
    pagination:       undefined,
    listState:        { status: "unavailable", message: accessScope.deniedReason ?? runtimeListText.system.accessScopeUnavailable },
    rawSearchParams,
    search:           buildEmptySearchState(urlState.search ?? ""),
    lazyList:         buildEmptyLazyListState(entityCode, rawSearchParams),
    searchValue:      urlState.search ?? "",
    activeFilters:    [],
    activeSort:       [],
    page:             1,
    pageSize:         20,
    viewMode:         "list",
    density:          "compact",
    groupField:       undefined,
    listPresentation: buildDefaultListPresentation(),
    createHref:       null,
    toolbarActions:   [],
    savedViews:       [],
    activeSavedViewId:null,
    accessScope,
    features,
    featureDiagnostics: featureResolution.diagnostics,
    clientAdapter,
    filterableFields: [],
    sortableFields:   [],
    groupableFields:  [],
  };
}

async function buildUnavailableProps(
  adapter:        RuntimeListServerAdapter,
  entityCode:     string,
  rawSearchParams:RawSearchParams,
): Promise<RuntimeListPresenterProps> {
  const urlState    = parseListSearchParams(rawSearchParams);
  const accessScope = unavailableAccessScope(adapter, runtimeListText.system.entityDescriptorUnavailable);
  const featureResolution = resolveRuntimeListFeaturesWithDiagnostics({ adapterDefaults: adapter.features });
  const features = featureResolution.features;
  const clientAdapter: RuntimeListClientAdapter = {
    entityCode,
    features,
    listBaseHref:   adapter.entityListHref(entityCode),
    detailHrefBase: adapter.entityDetailHref(entityCode, "").replace(/\/$/, ""),
    newHref:        null,
    recordsApiHref: adapter.entityRecordsApiHref?.(entityCode) ?? null,
    savedViewsApiHref: adapter.entitySavedViewsApiHref?.(entityCode) ?? null,
    fieldOptionsApiHrefBase: adapter.entityFieldOptionsApiHrefBase?.(entityCode) ?? null,
  };
  return {
    entityCode,
    entityName:       entityCode,
    eyebrow:          entityCode,
    description:      "",
    columns:          [],
    allColumns:       [],
    defaultColumns:   [],
    rows:             [],
    pagination:       undefined,
    listState:        { status: "unavailable", message: runtimeListText.system.entityDescriptorUnavailable },
    rawSearchParams,
    search:           buildEmptySearchState(urlState.search ?? ""),
    lazyList:         buildEmptyLazyListState(entityCode, rawSearchParams),
    searchValue:      urlState.search ?? "",
    activeFilters:    [],
    activeSort:       [],
    page:             1,
    pageSize:         20,
    viewMode:         "list",
    density:          "compact",
    groupField:       undefined,
    listPresentation: buildDefaultListPresentation(),
    createHref:       null,
    toolbarActions:   [],
    savedViews:       [],
    activeSavedViewId:null,
    accessScope,
    features,
    featureDiagnostics: featureResolution.diagnostics,
    clientAdapter,
    filterableFields: [],
    sortableFields:   [],
    groupableFields:  [],
  };
}

function buildEmptyLazyListState(
  entityCode:       string,
  rawSearchParams:  RawSearchParams,
): RuntimeListPresenterProps["lazyList"] {
  const controls = normalizeLazyListControls({ lazyLoadEnabled: false });
  return {
    enabled:           false,
    initialRows:       [],
    initialPagination: undefined,
    page:              1,
    pageSize:          20,
    rawSearchParams,
    cacheKey:          buildRuntimeListBrowserCacheKey(entityCode, rawSearchParams, 20),
    descriptorHash:    `unavailable:${entityCode}`,
    scopeFingerprint:  "scope:none",
    cachePolicy:       DEFAULT_RUNTIME_LIST_CACHE_POLICY,
    controls,
  };
}

function unavailableAccessScope(
  adapter: RuntimeListServerAdapter,
  reason:  string,
): RuntimeAccessScope {
  return {
    plane:           adapter.plane,
    mode:            "tenant",
    status:          "denied",
    source:          "resolved",
    protectedFields: [],
    labels:          [],
    deniedReason:    reason,
  };
}
