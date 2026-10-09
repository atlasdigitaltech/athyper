import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiTransportError,
  entityListOperation,
  entityListQuery,
  type EntityListQueryState,
  type HttpClient,
} from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListRowV1,
  EntityListScopeCoordinateV1,
} from "@athyper/contract-platform-entity-list";

export interface ListPages {
  readonly rows: readonly EntityListRowV1[];
  readonly loading: boolean;
  readonly failed: boolean;
  /** Why the last request failed, when it did. */
  readonly error?: ApiTransportError;
  readonly hasNext: boolean;
  /** The query's total, only under exact counts (foundation section 5). */
  readonly total?: number;
  readonly loadMore: () => void;
  /** Requests the page that failed again. */
  readonly retry: () => void;
}

/** Everything one query has loaded, tagged with the query it belongs to. */
interface PagesState {
  readonly key: string;
  readonly rows: readonly EntityListRowV1[];
  readonly cursor?: string;
  readonly nextCursor?: string;
  readonly total?: number;
  readonly loading: boolean;
  readonly error?: ApiTransportError;
  /** The last page applied to `rows`, so it is never requested twice. */
  readonly applied?: string;
}

function freshPages(key: string, nextCursor: string | undefined): PagesState {
  return {
    key,
    rows: [],
    ...(nextCursor ? { nextCursor } : {}),
    loading: false,
  };
}

function transportError(cause: unknown): ApiTransportError {
  return cause instanceof ApiTransportError
    ? cause
    : new ApiTransportError(
        "parse",
        "The list response could not be verified",
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        { cause },
      );
}

/** Pages one secondary list query (a Board lane, a Calendar or Gantt stream,
 * a grouped-tree group) through the shared list operation. `query` must keep
 * its filters and sort constant across pages: the server binds the cursor to
 * both. When `firstCursor` is given, the first page was already fetched
 * elsewhere (the list's own page query) and only later pages load.
 *
 * The query's identity is the request it builds, so any input that changes
 * the request starts again from its first page with nothing shown. Loaded
 * state is stored with that identity and read only while it still matches,
 * so a reset needs no write during render. While `enabled` is false nothing
 * is requested and loaded pages are kept, so enabling again neither
 * refetches nor repeats a page. */
export function useListPages(input: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly query: EntityListQueryState | undefined;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly refreshKey: string;
  readonly firstCursor?: string | null;
  readonly enabled?: boolean;
}): ListPages {
  const {
    client,
    descriptor,
    query,
    scope,
    refreshKey,
    firstCursor,
    enabled = true,
  } = input;
  const continuation = firstCursor !== undefined;
  const seed = continuation ? (firstCursor ?? undefined) : undefined;
  const queryKey = JSON.stringify([
    descriptor.revision.descriptorHash,
    descriptor.scope.fingerprint,
    query
      ? entityListQuery({ ...query, cursor: undefined }, descriptor, scope)
      : null,
    refreshKey,
    continuation ? (firstCursor ?? null) : "fresh",
  ]);
  const [stored, setStored] = useState(() => freshPages(queryKey, seed));
  const [attempt, setAttempt] = useState(0);
  const pages = stored.key === queryKey ? stored : freshPages(queryKey, seed);
  const { cursor } = pages;
  // Effects read the latest inputs; `queryKey` decides when they matter.
  const latest = useRef({ input, pages });
  latest.current = { input, pages };

  useEffect(() => {
    const { input: current, pages: loaded } = latest.current;
    const { descriptor, query: request, scope } = current;
    if (!enabled || !request || (continuation && !cursor)) return;
    const requestKey = JSON.stringify([queryKey, cursor ?? null]);
    if (loaded.applied === requestKey) return;
    // Updates apply to this query's state only; a newer query starts fresh.
    const update = (change: (state: PagesState) => PagesState) =>
      setStored((previous) =>
        change(
          previous.key === queryKey ? previous : freshPages(queryKey, seed),
        ),
      );
    const controller = new AbortController();
    update(({ error: _error, ...state }) => ({ ...state, loading: true }));
    client
      .request(entityListOperation, {
        params: { entityCode: descriptor.entity.code },
        query: entityListQuery({ ...request, cursor }, descriptor, scope),
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (
          page.descriptorHash !== descriptor.revision.descriptorHash ||
          page.scopeFingerprint !== descriptor.scope.fingerprint
        )
          throw new TypeError(
            "List response authority no longer matches its descriptor",
          );
        update(({ nextCursor: _next, total: _total, ...state }) => ({
          ...state,
          rows: cursor ? [...state.rows, ...page.rows] : page.rows,
          ...(page.pagination.hasNext && page.pagination.nextCursor
            ? { nextCursor: page.pagination.nextCursor }
            : {}),
          ...(page.pagination.countMode === "exact" &&
          page.pagination.total !== undefined
            ? { total: page.pagination.total }
            : {}),
          loading: false,
          applied: requestKey,
        }));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          update((state) => ({
            ...state,
            loading: false,
            error: transportError(cause),
          }));
      });
    return () => {
      // An aborted request settles nothing, so it must not leave `loading` set.
      controller.abort();
      update((state) => (state.loading ? { ...state, loading: false } : state));
    };
  }, [client, queryKey, cursor, continuation, enabled, attempt, seed]);

  const { nextCursor, loading, error } = pages;
  const loadMore = useCallback(() => {
    if (nextCursor && !loading && !error)
      setStored((previous) =>
        previous.key === queryKey
          ? { ...previous, cursor: nextCursor }
          : { ...freshPages(queryKey, seed), cursor: nextCursor },
      );
  }, [nextCursor, loading, error, queryKey, seed]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    rows: pages.rows,
    loading,
    failed: error !== undefined,
    ...(error ? { error } : {}),
    hasNext: nextCursor !== undefined,
    ...(pages.total === undefined ? {} : { total: pages.total }),
    loadMore,
    retry,
  };
}
