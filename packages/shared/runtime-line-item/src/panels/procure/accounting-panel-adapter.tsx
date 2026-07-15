"use client";

import { AccountingPanel } from "../accounting-panel";
import { useProcureLineDistributions } from "../../variants/procure";
import { recordId } from "../../meta";
import type { LineItemPanelProps } from "../../types";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { LineRecord } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// AccountingPanelAdapter
//
// Bridges LineItemPanelProps → AccountingPanelProps.
// Fetches line distributions internally so the panel stays self-contained.
// Renders a placeholder in compose mode (no persisted line yet).
// ─────────────────────────────────────────────────────────────────────────────

export function AccountingPanelAdapter({
  line,
  mode,
  parentEntityCode,
  recordId: parentRecordId,
  entity,
  currencyCode,
  record,
  readOnly,
  draft,
  onDraftChange,
}: LineItemPanelProps) {
  const lineId = recordId(line as LineRecord | null | undefined);
  const isEditMode = mode === "edit" && Boolean(lineId);

  const { distributions, loading } = useProcureLineDistributions(
    parentEntityCode,
    parentRecordId,
    lineId,
    isEditMode,
  );

  if (!isEditMode || !line) {
    const graph = draft["__create_graph"] && typeof draft["__create_graph"] === "object"
      ? draft["__create_graph"] as Record<string, unknown>
      : {};
    const staged = graph["accounting_distribution"] && typeof graph["accounting_distribution"] === "object"
      ? graph["accounting_distribution"] as { rows?: unknown[] }
      : null;
    const netAmount = Number(draft["net_amount"] ?? draft["line_amount"] ?? 0);
    const fakeLine = {
      id: "staged",
      ...draft,
      net_amount: netAmount,
      line_amount: netAmount,
    } as unknown as DocumentLine;
    return (
      <AccountingPanel
        line={fakeLine}
        distributions={(staged?.rows ?? []) as import("@athyper/api-contracts/documents").AccountingDistribution[]}
        entityCode={parentEntityCode}
        recordId={parentRecordId}
        entity={entity ?? undefined}
        currencyCode={currencyCode}
        formData={record ?? null}
        readOnly={readOnly}
        staged
        onStagedChange={(rows) => {
          const nextGraph = { ...graph };
          if (rows.length > 0) {
            nextGraph["accounting_distribution"] = { mode: "replace_default", rows };
          } else {
            delete nextGraph["accounting_distribution"];
          }
          onDraftChange({ __create_graph: nextGraph });
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        Loading distributions…
      </div>
    );
  }

  return (
    <AccountingPanel
      line={line as DocumentLine}
      distributions={distributions as import("@athyper/api-contracts/documents").AccountingDistribution[]}
      entityCode={parentEntityCode}
      recordId={parentRecordId}
      entity={entity ?? undefined}
      currencyCode={currencyCode}
      formData={record ?? null}
      readOnly={readOnly}
    />
  );
}
