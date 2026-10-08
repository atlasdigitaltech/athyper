import { useCallback, useEffect, useRef, useState } from "react";
import {
  entityListOperation,
  entityListQuery,
  type HttpClient,
} from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListRowV1,
  EntityListScopeCoordinateV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { laneFilter, type BoardLane } from "./board-model";

export interface BoardLanePage {
  readonly rows: readonly EntityListRowV1[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly hasNext: boolean;
  readonly loadMore: () => void;
}

/** One lane's records: the current list query AND the lane filter, paged by
 * cursor through the same list operation as every other layout. Requests
 * start only when `enabled` (lane expanded and in view) and are aborted
 * whenever the query, lane or authority changes. */
export function useBoardLanePage(input: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  readonly field: string;
  readonly lane: BoardLane;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly enabled: boolean;
  /** Changes when the list is refreshed, so lanes reload with it. */
  readonly refreshKey: string;
}): BoardLanePage {
  const { client, descriptor, state, field, lane, enabled, refreshKey } = input;
  const [rows, setRows] = useState<readonly EntityListRowV1[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const queryKey = JSON.stringify([
    descriptor.revision.descriptorHash,
    descriptor.scope.fingerprint,
    state.standardViewKey ?? null,
    state.query ?? null,
    state.filters,
    state.sort,
    state.columns,
    field,
    lane.key,
    refreshKey,
  ]);
  // The effect reads the latest inputs; queryKey decides when they matter.
  const latest = useRef(input);
  latest.current = input;
  const lastKey = useRef(queryKey);
  if (lastKey.current !== queryKey) {
    // A new query starts from its first page.
    lastKey.current = queryKey;
    if (cursor !== undefined) setCursor(undefined);
  }

  useEffect(() => {
    if (!enabled) return;
    const { descriptor, state, field, lane, scope } = latest.current;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    client
      .request(entityListOperation, {
        params: { entityCode: descriptor.entity.code },
        query: entityListQuery(
          {
            ...state,
            group: undefined,
            cursor,
            pageSize: descriptor.limits.defaultPageSize,
            filters: [...state.filters, laneFilter(field, lane)],
          },
          descriptor,
          scope,
        ),
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (page.descriptorHash !== descriptor.revision.descriptorHash || page.scopeFingerprint !== descriptor.scope.fingerprint)
          throw new TypeError("Lane response authority no longer matches its descriptor");
        setRows((previous) => (cursor ? [...previous, ...page.rows] : page.rows));
        setNextCursor(page.pagination.hasNext ? page.pagination.nextCursor : undefined);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, enabled, queryKey, cursor]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) setCursor(nextCursor);
  }, [nextCursor, loading]);
  return { rows, loading, failed, hasNext: nextCursor !== undefined, loadMore };
}

/** True once the element has scrolled into view (or when the platform cannot
 * observe visibility, in which case lanes load immediately). */
export function useInView<T extends Element>(): readonly [(element: T | null) => void, boolean] {
  const [element, setElement] = useState<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!element || visible) return;
    const View = element.ownerDocument.defaultView;
    const Observer = (View as (Window & typeof globalThis) | null)?.IntersectionObserver;
    if (!Observer) {
      setVisible(true);
      return;
    }
    const observer = new Observer((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: "0px 200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, visible]);
  return [setElement, visible] as const;
}
