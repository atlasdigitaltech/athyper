"use client";

import { AccountingPanel } from "../AccountingPanel";
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
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        Save the line first to manage accounting distributions.
      </div>
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
