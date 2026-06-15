"use client";

/**
 * EntityBulkActionBar — Layer 3 surface adapter.
 *
 * Replaces the legacy `BulkActionDialog` floating bar in EntityListPage.
 * Composes the three layers:
 *   1. @athyper/ui FloatingSelectionBar (pure UI pill + mobile sheet)
 *   2. @athyper/runtime-bulk-actions     (preflight + confirm/result dialogs)
 *   3. this adapter — provides the entity-aware bulkClient and wires the
 *      EntityOperation[] from metadata into SelectionAction[].
 *
 * Keyboard shortcuts are disabled (entity grids have inline editing + cmdK).
 * Focus auto-acquire is `keyboard-only` so mouse selection does not steal
 * focus from the table.
 */

import { useMemo } from "react";
import type { EntityOperation } from "@athyper/api-contracts/metadata";
import { resolveActionsForSurface } from "@athyper/metadata-client";
import {
  FloatingSelectionBar,
  type SelectionAction,
} from "@athyper/ui/composites";
import {
  BulkConfirmDialog,
  BulkResultDialog,
  RuntimeBulkActionsProvider,
  bulkActionCode,
  filterBulkOperations,
  mapOperationsToActions,
  useBulkActionRunner,
  useBulkPreflight,
  type BulkClient,
} from "@athyper/runtime-bulk-actions";

interface EntityBulkActionBarProps {
  entityCode:  string;
  selectedIds: string[];
  operations:  EntityOperation[];
  onClear:     () => void;
  onComplete?: () => void;
}

/**
 * Built-in BulkClient that targets the BFF relay. EntityListPage's previous
 * direct `/api/relay/api/...` fetches preserved verbatim so behaviour is
 * byte-identical. Apps that need a different transport can build their own
 * client and provide it via <RuntimeBulkActionsProvider> upstream.
 */
function createRelayBulkClient(): BulkClient {
  const csrf = () => {
    const m = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]!) : "";
  };
  return {
    preflight: async (entityCode, body) => {
      const res = await fetch(`/api/relay/api/records/${entityCode}/bulk-preflight`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
        body:    JSON.stringify({ ...body, ids: body.recordIds }),
      });
      if (!res.ok) throw new Error(`Preflight failed: ${res.status}`);
      return res.json();
    },
    action: async (entityCode, body) => {
      const res = await fetch(`/api/relay/api/records/${entityCode}/bulk-action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
        body:    JSON.stringify({ ...body, ids: body.recordIds }),
      });
      if (!res.ok) throw new Error(`Action failed: ${res.status}`);
      return res.json();
    },
  };
}

export function EntityBulkActionBar(props: EntityBulkActionBarProps) {
  // Build the relay client once per mount; it has no per-render dependencies.
  const bulkClient = useMemo(() => createRelayBulkClient(), []);
  return (
    <RuntimeBulkActionsProvider config={{ bulkClient }}>
      <EntityBulkActionBarInner {...props} />
    </RuntimeBulkActionsProvider>
  );
}

function EntityBulkActionBarInner({
  entityCode,
  selectedIds,
  operations,
  onClear,
  onComplete,
}: EntityBulkActionBarProps) {
  const ops = useMemo(() => {
    const list   = resolveActionsForSurface(operations, "LIST");
    const detail = resolveActionsForSurface(operations, "DETAIL");
    return filterBulkOperations(list, detail);
  }, [operations]);

  const actionCodes = useMemo(
    () => ops.map(bulkActionCode).filter((c) => c !== "export"),
    [ops],
  );

  const { preflightMap, loading: preflightLoading, deferred: preflightDeferred } = useBulkPreflight({
    entityCode,
    ids:         selectedIds,
    actionCodes,
  });

  const runner = useBulkActionRunner({
    entityCode,
    onComplete: () => onComplete?.(),
  });

  const handleExport = async () => {
    // Export remains a special case: no preflight, separate endpoint that
    // returns a download URL. Behaviour preserved from BulkActionDialog.
    const m = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]!) : "";
    try {
      const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/export`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body:    JSON.stringify({ selectionMode: "ids", ids: selectedIds, format: "csv" }),
      });
      const data = await res.json().catch(() => ({})) as { downloadUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Export failed: ${res.status}`);
      if (data.downloadUrl) window.location.href = `/api/relay${data.downloadUrl}`;
    } catch (err) {
      // Swallow + leave the bar open. Surfacing this needs a toast — wire
      // through ToastProvider in a follow-up if not already on this surface.
      console.error("[EntityBulkActionBar] export failed", err);
    }
  };

  const actions: SelectionAction[] = useMemo(() => {
    return mapOperationsToActions(ops, {
      selectionCount:   selectedIds.length,
      preflightMap,
      preflightLoading,
      preflightDeferred,
      busyActionId:     runner.state.phase === "executing" ? runner.state.activeAction : null,
      onSelect: (actionCode) => {
        if (actionCode === "export") {
          void handleExport();
          return;
        }
        const cached = preflightMap[actionCode] ?? null;
        void runner.start(actionCode, selectedIds, cached);
      },
    });
  // handleExport is local + stable enough; deps cover the inputs that change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, selectedIds, preflightMap, preflightLoading, preflightDeferred, runner.state.phase, runner.state.activeAction]);

  return (
    <>
      <FloatingSelectionBar
        count={selectedIds.length}
        noun={{ singular: "record", plural: "records" }}
        actions={actions}
        onClear={onClear}
        busy={runner.state.phase === "preflight" || runner.state.phase === "executing"}
        enableShortcuts={false}
        autoFocus="keyboard-only"
        testId="entity-bulk-action-bar"
      />
      <BulkConfirmDialog
        state={runner.state}
        onConfirm={() => void runner.confirm()}
        onCancel={runner.close}
      />
      <BulkResultDialog
        state={runner.state}
        onClose={() => {
          runner.close();
          onClear();
        }}
      />
    </>
  );
}
