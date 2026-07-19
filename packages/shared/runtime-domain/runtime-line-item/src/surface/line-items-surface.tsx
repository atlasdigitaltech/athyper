"use client";

import { useEffect, useState } from "react";
import type { AccountingDistribution, DocumentLine } from "@athyper/api-contracts/documents";
import type { MetaEntityLineItemsSurface } from "@athyper/runtime-contracts";
import type { ControlledLineItemsSurfaceData, LineItemsSurfaceProps, LineRecord } from "../types";
import { LinesGrid } from "./lines-grid";

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHING HOOKS
// ─────────────────────────────────────────────────────────────────────────────

type LinesResponse = { data?: DocumentLine[] };
type DistributionsResponse = { data?: AccountingDistribution[] };

function normalizeLineResponseRow(row: DocumentLine): LineRecord {
  const source = row as unknown as Record<string, unknown>;
  const nested = source["data"] !== null
    && typeof source["data"] === "object"
    && !Array.isArray(source["data"])
    ? source["data"] as Record<string, unknown>
    : {};
  const lineNumber = source["line_no"]
    ?? source["line_number"]
    ?? nested["line_no"]
    ?? nested["line_number"];

  return {
    ...source,
    ...nested,
    ...(lineNumber !== undefined ? { line_no: lineNumber, line_number: lineNumber } : {}),
  } as unknown as LineRecord;
}

/**
 * Plan v5 amendment 2 — when `controlledData` is supplied, the hook
 * skips its internal fetches and surfaces the parent-owned bundle.
 * React hooks must be called unconditionally, so the early-return at
 * the bottom of the function is the gate — useEffect itself bails when
 * controlled mode is active.
 */
function useLineItemsData(
  entityCode:      string,
  recordId:        string,
  lineEntityCode:  string,
  surface:         MetaEntityLineItemsSurface,
  controlledData?: ControlledLineItemsSurfaceData,
): {
  lines:         LineRecord[];
  distributions: AccountingDistribution[];
  pricingComponents: ReadonlyArray<Record<string, unknown>>;
  isLoading:     boolean;
  refresh:       () => void;
} {
  const [lines,         setLines]         = useState<LineRecord[]>([]);
  const [distributions, setDistributions] = useState<AccountingDistribution[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);

  useEffect(() => {
    if (controlledData) return;                                        // controlled mode — skip fetch
    if (!entityCode || !recordId || !lineEntityCode) return;
    let cancelled = false;
    setIsLoading(true);

    const linesUrl = `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines?entity=${encodeURIComponent(lineEntityCode)}`;

    const fetches: Promise<void>[] = [
      fetch(linesUrl)
        .then((r) => r.ok ? r.json() as Promise<LinesResponse> : null)
        .then((body) => {
          if (!cancelled) setLines((body?.data ?? []).map(normalizeLineResponseRow));
        })
        .catch(() => { if (!cancelled) setLines([]); }),
    ];

    if (surface.displayMode === "split_accounting") {
      const distUrl = `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/distributions`;
      fetches.push(
        fetch(distUrl)
          .then((r) => r.ok ? r.json() as Promise<DistributionsResponse> : null)
          .then((body) => { if (!cancelled) setDistributions(body?.data ?? []); })
          .catch(() => { if (!cancelled) setDistributions([]); }),
      );
    }

    void Promise.all(fetches).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [entityCode, recordId, lineEntityCode, surface.displayMode, refreshKey, controlledData]);

  if (controlledData) {
    return {
      lines:         controlledData.lines as LineRecord[],
      distributions: (controlledData.distributions ?? []) as AccountingDistribution[],
      pricingComponents: controlledData.pricingComponents ?? [],
      isLoading:     controlledData.isLoading,
      refresh:       () => { void controlledData.onRefresh(); },
    };
  }

  const refresh = () => setRefreshKey((k) => k + 1);
  return { lines, distributions, pricingComponents: [], isLoading, refresh };
}

// ─────────────────────────────────────────────────────────────────────────────
// LINE ITEMS SURFACE
//
// This is the canonical replacement for the thin runtime-canvas surface.
// It:
//   1. Fetches lines (and distributions for split_accounting mode)
//   2. Renders the fully featured LinesGrid with variant-aware sheet dispatch
//   3. Supports editMode toggle from parent document context
// ─────────────────────────────────────────────────────────────────────────────

export function LineItemsSurface({
  surface,
  entity,
  entityCode,
  recordId,
  currencyCode,
  companyCodeId,
  record,
  editMode = true,
  mobileColumns,
  controlledData,
  renderRowExpansion,
  selectionOperations,
  lineFieldChangeResolver,
  submitWorkspaceChanges,
}: LineItemsSurfaceProps) {
  const lineEntityCode = surface.entityCode;

  const { lines, distributions, pricingComponents, isLoading, refresh } = useLineItemsData(
    entityCode,
    recordId,
    lineEntityCode,
    surface,
    controlledData,
  );

  return (
    <LinesGrid
      surface={surface}
      entity={entity}
      entityCode={entityCode}
      recordId={recordId}
      lineEntityCode={lineEntityCode}
      currencyCode={currencyCode}
      companyCodeId={companyCodeId}
      record={record}
      lines={lines}
      distributions={distributions}
      pricingComponents={pricingComponents}
      isLoading={isLoading}
      onRefresh={refresh}
      editMode={editMode}
      mobileColumns={mobileColumns}
      renderRowExpansion={renderRowExpansion}
      selectionOperations={selectionOperations}
      lineFieldChangeResolver={lineFieldChangeResolver}
      submitWorkspaceChanges={submitWorkspaceChanges}
    />
  );
}
