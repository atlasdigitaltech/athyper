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

export interface DateRangePages {
  readonly rows: readonly EntityListRowV1[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly hasNext: boolean;
  /** The query's total, only under exact counts (foundation section 5). */
  readonly total?: number;
  readonly loadMore: () => void;
}

/** Pages one calendar query through the shared list operation. `query` must
 * keep its filters and sort constant across pages: the server binds the
 * cursor to both. When `firstCursor` is given, the first page was already
 * fetched elsewhere (the list's own page query) and only later pages load. */
export function useDateRangePages(input: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly query: ListLocationStateV1 | undefined;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly refreshKey: string;
  readonly firstCursor?: string | null;
}): DateRangePages {
  const { client, query, refreshKey, firstCursor } = input;
  const continuation = firstCursor !== undefined;
  const [rows, setRows] = useState<readonly EntityListRowV1[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [total, setTotal] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(input);
  latest.current = input;
  const queryKey = JSON.stringify([
    input.descriptor.revision.descriptorHash,
    input.descriptor.scope.fingerprint,
    query
      ? [
          query.standardViewKey ?? null,
          query.query ?? null,
          query.filters,
          query.sort,
          query.columns,
          query.pageSize,
        ]
      : null,
    refreshKey,
    continuation ? (firstCursor ?? null) : "fresh",
  ]);
  const lastKey = useRef(queryKey);
  if (lastKey.current !== queryKey) {
    lastKey.current = queryKey;
    setRows([]);
    setTotal(undefined);
    setCursor(undefined);
    setNextCursor(continuation ? (firstCursor ?? undefined) : undefined);
  }
  useEffect(() => {
    if (continuation) setNextCursor(firstCursor ?? undefined);
    // Only the first page's cursor seeds a continuation.
  }, [continuation, firstCursor]);
  useEffect(() => {
    const { descriptor, query: current, scope } = latest.current;
    if (!current || (continuation && !cursor)) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    client
      .request(entityListOperation, {
        params: { entityCode: descriptor.entity.code },
        query: entityListQuery({ ...current, cursor }, descriptor, scope),
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (
          page.descriptorHash !== descriptor.revision.descriptorHash ||
          page.scopeFingerprint !== descriptor.scope.fingerprint
        )
          throw new TypeError(
            "Calendar response authority no longer matches its descriptor",
          );
        setRows((previous) =>
          cursor ? [...previous, ...page.rows] : page.rows,
        );
        setNextCursor(
          page.pagination.hasNext ? page.pagination.nextCursor : undefined,
        );
        setTotal(
          page.pagination.countMode === "exact"
            ? page.pagination.total
            : undefined,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, queryKey, cursor, continuation]);
  const loadMore = useCallback(() => {
    if (nextCursor && !loading) setCursor(nextCursor);
  }, [nextCursor, loading]);
  return {
    rows,
    loading,
    failed,
    hasNext: nextCursor !== undefined,
    ...(total === undefined ? {} : { total }),
    loadMore,
  };
}
