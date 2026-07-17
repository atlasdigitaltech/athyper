import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type {
  RuntimeListServerAdapter,
  EntityListResponse,
  RawSearchParams,
  RuntimeDescriptor,
  RuntimeAccessContext,
  RuntimeAccessScope,
  RuntimeListSearchControls,
  RuntimeListLazyControls,
  RuntimeListState,
  SavedView,
  RuntimeListFeatureConfig,
} from "@athyper/runtime-list/adapter";
import {
  applyAccessScopeToRawParams,
  createDelegatedAccessScope,
  resolveRuntimeAccessScope,
} from "@athyper/runtime-list/core";
import { toRuntimeDescriptor } from "./descriptorConverter";

// ─── Fallback list policy for the neon plane ──────────────────────────────────
// Entity descriptor metadata is resolved above this policy at request time.
// Keep these values only for entities that have not declared list_features yet.

const NEON_LIST_FEATURE_DEFAULTS: RuntimeListServerAdapter["features"] = {
  savedViews:          true,
  bulkActions:         true,
  export:              true,
  import:              true,
  columnCustomization: true,
  grouping:            true,
  multiSort:           true,
  maxSortLevels:       3,
  viewModes:           ["list", "compact", "excel"],
  searchMode:          "both",
  maxPageSize:         500,
};

// ─── Adapter config injected by the calling app route ─────────────────────────
// The app route (apps/neon) injects the actual server functions.
// This avoids a circular dependency: packages/apps/neon cannot import from apps/neon.

export interface NeonAdapterConfig {
  fetchDescriptor: (
    entityCode: string,
  ) => Promise<MetaEntityRuntimeDescriptor | null>;

  fetchRecords: (
    entityCode:     string,
    searchParams:   RawSearchParams,
    descriptor?:    MetaEntityRuntimeDescriptor,
    accessScope?:   RuntimeAccessScope,
  ) => Promise<{
    records: unknown[];
    state?: unknown;
    pagination?: unknown;
    isFullyLoaded?: boolean;
    reasons?: Record<string, boolean>;
  }>;

  accessContext?: RuntimeAccessContext;
  resolveAccessContext?: () => Promise<RuntimeAccessContext | null>;
  resolveAccessScope?: (
    entityCode: string,
    descriptor: RuntimeDescriptor,
  ) => Promise<RuntimeAccessScope>;
  resolveSearchControls?: (
    entityCode:  string,
    descriptor:  RuntimeDescriptor,
    accessScope: RuntimeAccessScope,
  ) => Promise<Partial<RuntimeListSearchControls> | null>;
  resolveLazyListControls?: (
    entityCode:  string,
    descriptor:  RuntimeDescriptor,
    accessScope: RuntimeAccessScope,
  ) => Promise<Partial<RuntimeListLazyControls> | null>;
  resolveListFeatures?: (
    entityCode: string,
    descriptor: RuntimeDescriptor,
  ) => RuntimeListFeatureConfig | null | Promise<RuntimeListFeatureConfig | null>;

  // Optional saved view hooks — wire when the saved-views API is ready
  fetchSavedViews?: (entityCode: string) => Promise<SavedView[]>;
  fetchSavedView?:  (viewId: string, entityCode?: string) => Promise<Partial<RuntimeListState> | null>;
  savedViewsApiHref?: (entityCode: string) => string | null;
}

export function resolveNeonAccessScope(
  descriptor: RuntimeDescriptor,
  context:    RuntimeAccessContext,
): RuntimeAccessScope {
  return resolveRuntimeAccessScope("neon", descriptor, context);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

// Descriptor cache TTL — evict after 5 minutes so field-security policy changes
// (isVisible, isPii) are reflected without requiring a process restart.
const DESCRIPTOR_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedDescriptor {
  promise: Promise<MetaEntityRuntimeDescriptor | null>;
  expiresAt: number;
}

export function createNeonAdapter(config: NeonAdapterConfig): RuntimeListServerAdapter {
  const metaDescriptorCache = new Map<string, CachedDescriptor>();

  const fetchMetaDescriptor = (entityCode: string): Promise<MetaEntityRuntimeDescriptor | null> => {
    const cached = metaDescriptorCache.get(entityCode);
    if (cached && Date.now() < cached.expiresAt) return cached.promise;

    const promise = config.fetchDescriptor(entityCode).catch((err) => {
      // Evict immediately on failure so the next request retries rather than
      // re-throwing the cached rejection for the lifetime of the process.
      metaDescriptorCache.delete(entityCode);
      throw err;
    });

    metaDescriptorCache.set(entityCode, {
      promise,
      expiresAt: Date.now() + DESCRIPTOR_CACHE_TTL_MS,
    });
    return promise;
  };

  return {
    plane: "neon",
    features: NEON_LIST_FEATURE_DEFAULTS,

    async fetchDescriptor(entityCode: string): Promise<RuntimeDescriptor | null> {
      const meta = await fetchMetaDescriptor(entityCode);
      if (!meta) return null;
      return toRuntimeDescriptor(meta);
    },

    async resolveAccessScope(entityCode: string, descriptor: RuntimeDescriptor): Promise<RuntimeAccessScope> {
      if (config.resolveAccessScope) {
        return config.resolveAccessScope(entityCode, descriptor);
      }

      const context = await (config.resolveAccessContext?.() ?? Promise.resolve(config.accessContext ?? null));
      if (!context) {
        // Return a denied scope rather than a delegated (unscoped) one.
        // A missing access context on the neon plane means the session could not be
        // resolved; falling through to an unscoped query would risk returning
        // cross-tenant data.
        return {
          plane:           "neon",
          mode:            "tenant",
          status:          "denied",
          source:          "resolved",
          protectedFields: [],
          labels:          [],
          deniedReason:    "Access context is required for the neon plane.",
        };
      }

      return resolveRuntimeAccessScope("neon", descriptor, context);
    },

    async resolveSearchControls(
      entityCode:  string,
      descriptor:  RuntimeDescriptor,
      accessScope: RuntimeAccessScope,
    ): Promise<Partial<RuntimeListSearchControls> | null> {
      return config.resolveSearchControls?.(entityCode, descriptor, accessScope) ?? null;
    },

    async resolveLazyListControls(
      entityCode:  string,
      descriptor:  RuntimeDescriptor,
      accessScope: RuntimeAccessScope,
    ): Promise<Partial<RuntimeListLazyControls> | null> {
      return config.resolveLazyListControls?.(entityCode, descriptor, accessScope) ?? null;
    },

    async resolveListFeatures(entityCode: string, descriptor: RuntimeDescriptor) {
      return (await config.resolveListFeatures?.(entityCode, descriptor)) ?? null;
    },

    async fetchRecords(
      entityCode:      string,
      rawSearchParams: RawSearchParams,
      _sharedDescriptor:RuntimeDescriptor,
      accessScope:     RuntimeAccessScope,
    ): Promise<EntityListResponse> {
      // Reuse the original MetaEntityRuntimeDescriptor for scope filters, hydration,
      // and PII masking inside getMetaEntityRecordList.
      const meta = await fetchMetaDescriptor(entityCode);

      // The shared URL contract uses "size" for page-size; getMetaEntityRecordList
      // reads the legacy "page_size" key. Translate here so the data layer sees it.
      const scopedParams = applyAccessScopeToRawParams(rawSearchParams, accessScope);
      const { size: pageSize, ...paramsWithoutSize } = scopedParams;
      const translatedParams: RawSearchParams = {
        ...paramsWithoutSize,
        // Only inject page_size when size was actually present in the URL params.
        // Injecting undefined would stomp over any page_size already carried through
        // paramsWithoutSize from the original params object.
        ...(pageSize !== undefined && { page_size: pageSize }),
      };

      const result = await config.fetchRecords(entityCode, translatedParams, meta ?? undefined, accessScope);
      return {
        records:    result.records as EntityListResponse["records"],
        state:      result.state  as EntityListResponse["state"],
        pagination: result.pagination as EntityListResponse["pagination"],
        isFullyLoaded: result.isFullyLoaded,
        reasons:    result.reasons,
      };
    },

    async fetchSavedViews(entityCode: string) {
      if (!config.fetchSavedViews) return [];
      return config.fetchSavedViews(entityCode);
    },

    async fetchSavedView(viewId: string, entityCode?: string) {
      if (!config.fetchSavedView) return null;
      return config.fetchSavedView(viewId, entityCode);
    },

    // Navigation — neon app entity routes use /app/<entityCode>/<id>
    entityListHref:   (code: string) => `/app/${code}`,
    entityDetailHref: (code: string, id: string) => `/app/${code}/${id}`,
    entityNewHref:    (code: string) => `/app/${code}/new`,
    entityRecordsApiHref: (code: string) => runtimePath.list(code),
    // Base URL for runtime-list FilterControl; consumer appends `/fields/<field>/options`.
    entityFieldOptionsApiHrefBase: (code: string) => runtimePath.list(code),
    entitySavedViewsApiHref: (code: string) => config.savedViewsApiHref?.(code) ?? null,

  };
}
