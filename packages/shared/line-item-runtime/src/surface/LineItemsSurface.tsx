"use client";

import { useEffect, useState } from "react";
import type { AccountingDistribution, DocumentLine } from "@athyper/api-contracts/documents";
import type { MetaEntityLineItemsSurface } from "@athyper/runtime-contracts";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { LineItemsSurfaceProps, LineRecord } from "../types";
import { LinesGrid } from "./LinesGrid";

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHING HOOKS
// ─────────────────────────────────────────────────────────────────────────────

type LinesResponse = { data?: DocumentLine[] };
type DistributionsResponse = { data?: AccountingDistribution[] };

function useLineItemsData(
  entityCode:      string,
  recordId:        string,
  lineEntityCode:  string,
  surface:         MetaEntityLineItemsSurface,
): {
  lines:         LineRecord[];
  distributions: AccountingDistribution[];
  isLoading:     boolean;
  refresh:       () => void;
} {
  const [lines,         setLines]         = useState<LineRecord[]>([]);
  const [distributions, setDistributions] = useState<AccountingDistribution[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);

  useEffect(() => {
    if (!entityCode || !recordId || !lineEntityCode) return;
    let cancelled = false;
    setIsLoading(true);

    const linesUrl = `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines?entity=${encodeURIComponent(lineEntityCode)}`;

    const fetches: Promise<void>[] = [
      fetch(linesUrl)
        .then((r) => r.ok ? r.json() as Promise<LinesResponse> : null)
        .then((body) => { if (!cancelled) setLines((body?.data ?? []) as LineRecord[]); })
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
  }, [entityCode, recordId, lineEntityCode, surface.displayMode, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);
  return { lines, distributions, isLoading, refresh };
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
}: LineItemsSurfaceProps) {
  const lineEntityCode = surface.entityCode;

  const { lines, distributions, isLoading, refresh } = useLineItemsData(
    entityCode,
    recordId,
    lineEntityCode,
    surface,
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
      isLoading={isLoading}
      onRefresh={refresh}
      editMode={editMode}
      mobileColumns={mobileColumns}
    />
  );
}
