import type {
  RawSearchParams,
  RuntimeAccessScope,
  RuntimeListLazyControls,
} from "./types";

export const DEFAULT_LAZY_LIST_CONTROLS: RuntimeListLazyControls = {
  lazyLoadEnabled:           true,
  lazyLoadPageSize:          20,
  pageSizeSelectorEnabled:   true,
  defaultPageSize:           20,
  lazyPrefetchDistancePx:    320,
  loadedPageCacheTtlSeconds: 300,
  // Phase 1 uses this as a conservative rendered-row safety cap until table virtualization lands.
  maxLoadedRows:             200,
};

const RUNTIME_LIST_PAGE_CACHE_VERSION = "v2";

export function normalizeLazyListControls(
  input: Partial<RuntimeListLazyControls> | null | undefined,
): RuntimeListLazyControls {
  const definedInput = Object.fromEntries(
    Object.entries(input ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<RuntimeListLazyControls>;
  const merged = { ...DEFAULT_LAZY_LIST_CONTROLS, ...definedInput };
  const defaultPageSize = clampInt(merged.defaultPageSize, 1, 100, DEFAULT_LAZY_LIST_CONTROLS.defaultPageSize);
  return {
    lazyLoadEnabled:           Boolean(merged.lazyLoadEnabled),
    lazyLoadPageSize:          clampInt(merged.lazyLoadPageSize, 1, 100, defaultPageSize),
    pageSizeSelectorEnabled:   Boolean(merged.pageSizeSelectorEnabled),
    defaultPageSize,
    lazyPrefetchDistancePx:    clampInt(merged.lazyPrefetchDistancePx, 0, 2_000, DEFAULT_LAZY_LIST_CONTROLS.lazyPrefetchDistancePx),
    loadedPageCacheTtlSeconds: clampInt(merged.loadedPageCacheTtlSeconds, 0, 3_600, DEFAULT_LAZY_LIST_CONTROLS.loadedPageCacheTtlSeconds),
    maxLoadedRows:             clampInt(merged.maxLoadedRows, 20, 5_000, DEFAULT_LAZY_LIST_CONTROLS.maxLoadedRows),
  };
}

export function buildListPageParams(
  rawSearchParams: RawSearchParams,
  page:            number,
  pageSize:        number,
  serverQuery?:    string,
): URLSearchParams {
  const params = new URLSearchParams();
  const trimmedServerQuery = serverQuery?.trim() ?? "";

  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (!isDataAffectingListParam(key)) continue;
    const item = Array.isArray(value) ? value[0] : value;
    if (item) params.set(key, item);
  }

  params.set("page", String(Math.max(1, Math.floor(page))));
  params.set("page_size", String(Math.max(1, Math.floor(pageSize))));
  // The runtime-list loader is offset-page based. Explicitly opt out of the
  // cursor contract until this client carries navigation.nextCursor between
  // requests; otherwise every page request resolves to the first cursor page.
  params.set("query_v1", "0");
  if (trimmedServerQuery) {
    params.set("q", trimmedServerQuery);
    params.set("search_scope", "all");
  }
  return params;
}

export function buildRuntimeListBrowserCacheKey(
  entityCode:      string,
  rawSearchParams: RawSearchParams,
  pageSize:        number,
  scopeFingerprint = "scope:none",
): string {
  const stableParams = Object.entries(rawSearchParams)
    .filter(([key]) => isDataAffectingListParam(key))
    .flatMap(([key, value]) => {
      const item = Array.isArray(value) ? value[0] : value;
      return item ? [[key, item] as [string, string]] : [];
    })
    .sort(([a], [b]) => a.localeCompare(b));

  const params = stableParams
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  // Version the persisted page map so clients do not restore pages cached
  // under an incompatible pagination contract.
  return `runtime-list:${RUNTIME_LIST_PAGE_CACHE_VERSION}:${entityCode}:${pageSize}:${hashStableString(scopeFingerprint)}:${params}`;
}

export function buildRuntimeListScopeFingerprint(accessScope: RuntimeAccessScope | null | undefined): string {
  if (!accessScope) return "scope:none";
  return stableStringify({
    plane:           accessScope.plane,
    mode:            accessScope.mode,
    source:          accessScope.source,
    status:          accessScope.status,
    predicate:       accessScope.predicate ?? null,
    protectedFields: [...accessScope.protectedFields].sort(),
  });
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function isDataAffectingListParam(key: string): boolean {
  return key === "sort" || key === "group" || key === "cols" || key.startsWith("filter.");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashStableString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
