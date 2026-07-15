"use client";

import { useCallback, useRef, useState } from "react";
import type { BulkPreflightResult } from "@athyper/api-contracts/entity-list";
import { useBulkActionsConfig } from "./provider";
import { fromBulkActionResult } from "./normalize";
import type { NormalizedBulkResult } from "./types";

export type BulkPhase = "preflight" | "confirm" | "executing" | "done";

export interface BulkRunnerState {
  phase:        BulkPhase | null;
  activeAction: string | null;
  preflight:    BulkPreflightResult | null;
  result:       NormalizedBulkResult | null;
  error:        string | null;
}

const INITIAL: BulkRunnerState = {
  phase:        null,
  activeAction: null,
  preflight:    null,
  result:       null,
  error:        null,
};

export interface UseBulkActionRunnerArgs {
  entityCode: string;
  /** Called after a successful action — surfaces use this to refresh + clear selection. */
  onComplete?: () => void;
}

/**
 * State machine: null → preflight → confirm → executing → done.
 *
 * `start(actionCode, ids, cachedPreflight?)`:
 *   - if cachedPreflight is supplied, skip the network round-trip and go to "confirm".
 *   - otherwise run preflight then move to "confirm".
 *
 * `confirm()`:
 *   - move to "executing", call bulkClient.action, normalize, move to "done".
 *
 * `close()`: reset state.
 */
export function useBulkActionRunner({
  entityCode,
  onComplete,
}: UseBulkActionRunnerArgs) {
  const { bulkClient } = useBulkActionsConfig();
  const [state, setState] = useState<BulkRunnerState>(INITIAL);
  // Ref-tracked context — used inside confirm() to avoid stale closures.
  const ctxRef = useRef<{ ids: string[]; action: string | null }>({ ids: [], action: null });

  const start = useCallback(
    async (
      actionCode:       string,
      selectionIds:     string[],
      cachedPreflight?: BulkPreflightResult | null,
    ) => {
      ctxRef.current = { ids: selectionIds, action: actionCode };
      if (cachedPreflight) {
        setState({
          phase:        "confirm",
          activeAction: actionCode,
          preflight:    cachedPreflight,
          result:       null,
          error:        null,
        });
        return;
      }
      setState({
        phase:        "preflight",
        activeAction: actionCode,
        preflight:    null,
        result:       null,
        error:        null,
      });
      try {
        const data = await bulkClient.preflight(entityCode, {
          action:    actionCode,
          recordIds: selectionIds,
        });
        setState((s) => ({
          ...s,
          phase:     "confirm",
          preflight: data,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: null,
          error: err instanceof Error ? err.message : "Preflight failed",
        }));
      }
    },
    [bulkClient, entityCode],
  );

  const confirm = useCallback(async () => {
    const { ids, action } = ctxRef.current;
    if (!action) return;
    setState((s) => ({ ...s, phase: "executing", error: null }));
    try {
      const data = await bulkClient.action(entityCode, {
        action,
        recordIds: ids,
      });
      setState({
        phase:        "done",
        activeAction: action,
        preflight:    null,
        result:       fromBulkActionResult(data),
        error:        null,
      });
      onComplete?.();
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: "confirm",
        error: err instanceof Error ? err.message : "Action failed",
      }));
    }
  }, [bulkClient, entityCode, onComplete]);

  const close = useCallback(() => {
    setState(INITIAL);
    ctxRef.current = { ids: [], action: null };
  }, []);

  return { state, start, confirm, close };
}
