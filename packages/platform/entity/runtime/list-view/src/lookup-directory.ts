import type { EntityLookupOptions } from "@athyper/contract-platform-entity-runtime";
import type {
  EntityListDescriptorV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import {
  entityListDescriptorOperation,
  entityListOperation,
  entityListQuery,
  entityViewsOperation,
  type HttpClient,
} from "@athyper/platform-api-client";
import { isListViewAllowed } from "./view-policy";
import { readListLocation } from "./location";
/** Resolve the same view/filter state for compact search and the embedded directory. */
export function lookupInitialState(
  descriptor: EntityListDescriptorV1,
  options: EntityLookupOptions,
  query?: string,
): ListLocationStateV1 {
  const requested = options.views.usePersonalDefault
    ? (descriptor.viewCatalog?.personalDefault ?? options.views.defaultViewKey)
    : options.views.defaultViewKey;
  const key =
    !isListViewAllowed({savedViewId: requested, standardViewKey: descriptor.standardViews?.find(view => view.key === requested)?.key}, options.views.allowedViewKeys)
      ? options.views.defaultViewKey
      : requested;
  const standard = descriptor.standardViews?.some((view) => view.key === key);
  const state = readListLocation(
    descriptor,
    standard
      ? `?standardView=${encodeURIComponent(key)}`
      : `?vid=${encodeURIComponent(key)}`,
  );
  if (!isListViewAllowed(state, options.views.allowedViewKeys)) {
    throw Error("The configured lookup view is unavailable in this context.");
  }
  return {
    ...state,
    density: options.display.defaults.density,
    mode: descriptor.surface.supportedModes.includes(
      options.display.defaults.layout,
    )
      ? options.display.defaults.layout
      : state.mode,
    query: query || undefined,
  };
}
/** Component-owned; callers must replace it whenever authenticated context changes. */
export interface LookupDescriptorCache {
  descriptor?: EntityListDescriptorV1;
  loadedAt?: number;
  viewsLoaded?: boolean;
}
async function lookupDescriptor(
  client: HttpClient,
  entityCode: string,
  signal: AbortSignal,
  cache?: LookupDescriptorCache,
) {
  if (
    cache?.descriptor?.entity.code === entityCode &&
    Date.now() - (cache.loadedAt ?? 0) < 60_000
  )
    return cache.descriptor;
  const descriptor = await client.request(entityListDescriptorOperation, {
    params: { entityCode },
    signal,
  });
  if (cache && !signal.aborted) {
    cache.descriptor = descriptor;
    cache.loadedAt = Date.now();
    cache.viewsLoaded = false;
  }
  return descriptor;
}
export async function searchLookupDirectory(
  client: HttpClient,
  entityCode: string,
  options: EntityLookupOptions,
  query: string,
  signal: AbortSignal,
  state?: ListLocationStateV1,
  cache?: LookupDescriptorCache,
) {
  let descriptor = await lookupDescriptor(client, entityCode, signal, cache);
  if (descriptor.serverViews && !cache?.viewsLoaded) {
    descriptor = {
      ...descriptor,
      viewCatalog: await client.request(entityViewsOperation, {
        params: { entityCode },
        query: { surface: descriptor.surface.key },
        signal,
      }),
    };
    if (cache && !signal.aborted) {
      cache.descriptor = descriptor;
      cache.viewsLoaded = true;
    }
  }
  signal.throwIfAborted();
  if (query.trim().length < descriptor.surface.search.minimumQueryLength)
    throw Error(
      `Enter at least ${descriptor.surface.search.minimumQueryLength} characters to search.`,
    );
  const current = state && isListViewAllowed(state, options.views.allowedViewKeys) ? state : lookupInitialState(descriptor, options, query);
  const allowed = descriptor.limits.allowedPageSizes;
  const requestedSize = Math.min(
    current.pageSize ?? descriptor.limits.defaultPageSize,
    50,
  );
  const pageSize = allowed.includes(requestedSize)
    ? requestedSize
    : Math.max(
        ...allowed.filter((size) => size <= requestedSize),
        Math.min(...allowed),
      );
  const page = await client
    .request(entityListOperation, {
      params: { entityCode },
      query: entityListQuery(
        { ...current, query, cursor: undefined, pageSize },
        descriptor,
      ),
      signal,
    })
    .catch((error) => {
      if (cache && !signal.aborted) {
        cache.descriptor = undefined;
        cache.viewsLoaded = false;
      }
      throw error;
    });
  if (
    page.descriptorHash !== descriptor.revision.descriptorHash ||
    page.scopeFingerprint !== descriptor.scope.fingerprint
  ) {
    if (cache) {
      cache.descriptor = undefined;
      cache.viewsLoaded = false;
    }
    throw Error("Lookup authority changed. Please search again.");
  }
  return { rows: page.rows, hasNext: page.pagination.hasNext };
}

/** Read display preferences in the same authority/surface namespace as full view. */
export async function lookupSearchBehavior(
  client: HttpClient,
  entityCode: string,
  options: EntityLookupOptions,
  namespace: string,
  signal: AbortSignal,
  cache?: LookupDescriptorCache,
) {
  if (!options.display.userOverrides.includes("searchBehavior"))
    return options.display.defaults.searchBehavior;
  const descriptor = await lookupDescriptor(client, entityCode, signal, cache);
  const { readDisplayPreferences } = await import("./preferences");
  return (
    readDisplayPreferences(
      descriptor.plane,
      options.display.preferenceScope === "surface"
        ? `${descriptor.entity.code}.${descriptor.scope.fingerprint}.${namespace}`
        : undefined,
    )?.searchBehavior ?? options.display.defaults.searchBehavior
  );
}
