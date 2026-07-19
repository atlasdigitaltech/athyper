import "server-only";

import { getRuntimeConfigurationSnapshot } from "@/lib/server/runtime-configuration-snapshots";
import type { RuntimeListDiagnosticRecorder } from "@/lib/server/runtime-list-observability";

type SearchControls = {
  defaultScope?: "auto" | "loaded" | "all";
  minQueryLength?: number;
  loadedSearchThreshold?: number;
  autoSearchAllOnEmpty?: boolean;
  autoSearchAllDebounceMs?: number;
  manualSearchAllDebounceMs?: number;
  queryStabilityMs?: number;
  serverSearchTimeoutMs?: number;
  fuzzySearch?: boolean;
  visitedPageCache?: boolean;
  serverResultCacheTtlSeconds?: number;
};

type LazyListControls = {
  lazyLoadEnabled?: boolean;
  lazyLoadPageSize?: number;
  pageSizeSelectorEnabled?: boolean;
  defaultPageSize?: number;
  lazyPrefetchDistancePx?: number;
  loadedPageCacheTtlSeconds?: number;
  maxLoadedRows?: number;
};

export async function resolveNeonRuntimeSearchControls(
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<SearchControls | null> {
  const snapshot = await getRuntimeConfigurationSnapshot("api.search", diagnostics);
  if (!snapshot) return null;
  const values = snapshot.values;

  return {
    defaultScope:                enumValue(values["api.search.default_scope"], ["auto", "loaded", "all"]),
    minQueryLength:              intValue(values["api.search.min_query_length"]),
    loadedSearchThreshold:       intValue(values["api.search.loaded_search_threshold"]),
    autoSearchAllOnEmpty:        boolValue(values["api.search.auto_search_all_on_empty"]),
    autoSearchAllDebounceMs:     intValue(values["api.search.auto_search_all_debounce_ms"]),
    manualSearchAllDebounceMs:   intValue(values["api.search.manual_search_all_debounce_ms"]),
    queryStabilityMs:            intValue(values["api.search.query_stability_ms"]),
    serverSearchTimeoutMs:       intValue(values["api.search.server_timeout_ms"]),
    fuzzySearch:                 boolValue(values["api.search.fuzzy_enabled"]),
    visitedPageCache:            boolValue(values["api.search.visited_page_cache_enabled"]),
    serverResultCacheTtlSeconds: intValue(values["api.search.server_result_cache_ttl_seconds"]),
  };
}

export async function resolveNeonRuntimeLazyListControls(
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<LazyListControls | null> {
  const snapshot = await getRuntimeConfigurationSnapshot("api.list", diagnostics);
  if (!snapshot) return null;
  const values = snapshot.values;

  return {
    lazyLoadEnabled:           boolValue(values["api.list.lazy_load_enabled"]),
    lazyLoadPageSize:          intValue(values["api.list.lazy_load_page_size"]) ?? intValue(values["api.list.default_page_size"]),
    pageSizeSelectorEnabled:   boolValue(values["api.list.page_size_selector_enabled"]),
    defaultPageSize:           intValue(values["api.list.default_page_size"]),
    lazyPrefetchDistancePx:    intValue(values["api.list.lazy_prefetch_distance_px"]),
    loadedPageCacheTtlSeconds: intValue(values["api.list.loaded_page_cache_ttl_seconds"]),
    maxLoadedRows:             intValue(values["api.list.max_loaded_rows"]),
  };
}

function intValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

function boolValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : undefined;
}
