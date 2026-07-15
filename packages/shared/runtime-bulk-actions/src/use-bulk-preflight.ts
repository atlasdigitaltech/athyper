"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BulkPreflightResult } from "@athyper/api-contracts/entity-list";
import { useBulkActionsConfig } from "./provider";

const CACHE_TTL_MS = 30_000;

type CacheKey = string; // `${actionCode}|${idsSorted.join(",")}`

interface CacheEntry {
  ts:     number;
  result: BulkPreflightResult;
}

interface PreflightState {
  preflightMap: Record<string, BulkPreflightResult | null>;
  loading:      boolean;
  error:        string | null;
  /** True when selection exceeds maxIds — UI must block destructive actions. */
  overCap:      boolean;
  /** True when selection exceeds preflightCap — eligibility resolved on click instead. */
  deferred:     boolean;
}

const INITIAL: PreflightState = {
  preflightMap: {},
  loading:      false,
  error:        null,
  overCap:      false,
  deferred:     false,
};

export interface UseBulkPreflightArgs {
  entityCode:   string;
  ids:          string[];
  actionCodes:  string[];
}

/**
 * Background preflight with abort, stale-result guard, and 30s cache.
 *
 * - When selection exceeds `maxIds`, no requests are made and the UI is told
 *   (via `overCap`) to block destructive actions until the user trims.
 * - When selection exceeds `preflightCap`, background preflight is *deferred*
 *   to action-click; the map stays empty, `deferred: true`.
 * - Each action's request is independent; one slow action does not block
 *   others from resolving.
 */
export function useBulkPreflight({
  entityCode,
  ids,
  actionCodes,
}: UseBulkPreflightArgs): PreflightState {
  const { bulkClient, maxIds, preflightDebounce, preflightCap } = useBulkActionsConfig();
  const [state, setState] = useState<PreflightState>(INITIAL);

  // Stable cache keys for memo deps — sort once.
  const sortedIdsKey = useMemo(() => [...ids].sort().join(","), [ids]);
  const actionsKey   = useMemo(() => [...actionCodes].sort().join(","), [actionCodes]);

  // Module-scoped cache would leak across re-mounts of distinct entities;
  // keep it instance-scoped via ref.
  const cacheRef = useRef<Map<CacheKey, CacheEntry>>(new Map());
  // Monotonic request id — every selection/action change increments; in-flight
  // responses whose id is stale are dropped.
  const requestIdRef = useRef(0);
  // Active aborts so we can cancel on dependency change / unmount.
  const abortsRef    = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    // Cancel previous wave.
    abortsRef.current.forEach((c) => c.abort());
    abortsRef.current.clear();

    if (ids.length === 0 || actionCodes.length === 0) {
      setState(INITIAL);
      return;
    }

    if (ids.length > maxIds) {
      setState({ ...INITIAL, overCap: true });
      return;
    }

    if (ids.length > preflightCap) {
      // Defer: no background requests. UI should fall back to click-time preflight.
      setState({ ...INITIAL, deferred: true });
      return;
    }

    // Resolve cached entries up front so the UI doesn't flash "loading".
    const cachedMap: Record<string, BulkPreflightResult | null> = {};
    const toFetch:   string[] = [];
    const now = Date.now();
    for (const action of actionCodes) {
      const key   = `${action}|${sortedIdsKey}`;
      const entry = cacheRef.current.get(key);
      if (entry && now - entry.ts < CACHE_TTL_MS) {
        cachedMap[action] = entry.result;
      } else {
        toFetch.push(action);
      }
    }

    if (toFetch.length === 0) {
      setState({ preflightMap: cachedMap, loading: false, error: null, overCap: false, deferred: false });
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      setState({ preflightMap: cachedMap, loading: true, error: null, overCap: false, deferred: false });

      void (async () => {
        const results = await Promise.all(
          toFetch.map(async (action) => {
            const ac = new AbortController();
            abortsRef.current.add(ac);
            try {
              const data = await bulkClient.preflight(entityCode, {
                action,
                recordIds: ids,
              });
              return [action, data] as const;
            } catch {
              return [action, null] as const;
            } finally {
              abortsRef.current.delete(ac);
            }
          }),
        );

        // Stale-guard: drop responses whose request id is no longer current.
        if (currentRequestId !== requestIdRef.current) return;

        const merged: Record<string, BulkPreflightResult | null> = { ...cachedMap };
        const cacheNow = Date.now();
        for (const [action, data] of results) {
          merged[action] = data;
          if (data) {
            cacheRef.current.set(`${action}|${sortedIdsKey}`, { ts: cacheNow, result: data });
          }
        }
        setState({
          preflightMap: merged,
          loading:      false,
          error:        null,
          overCap:      false,
          deferred:     false,
        });
      })();
    }, preflightDebounce);

    return () => {
      clearTimeout(timer);
      abortsRef.current.forEach((c) => c.abort());
      abortsRef.current.clear();
    };
  // sortedIdsKey + actionsKey collapse array identity churn into stable strings.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityCode, sortedIdsKey, actionsKey, maxIds, preflightCap, preflightDebounce]);

  return state;
}
