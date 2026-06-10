"use client";

import { ClassificationPanel } from "../ClassificationPanel";
import { recordId } from "../../meta";
import type { LineItemPanelProps } from "../../types";
import type { LineRecord } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// ClassifyPanelAdapter
//
// Bridges LineItemPanelProps → ClassificationPanelProps.
// In compose mode, uses the draft as the classification source record.
// ─────────────────────────────────────────────────────────────────────────────

export function ClassifyPanelAdapter({
  line,
  draft,
  mode,
  parentEntityCode,
  recordId: parentRecordId,
}: LineItemPanelProps) {
  const lineId = recordId(line as LineRecord | null | undefined);
  const lineRecord = line ? ({ ...draft, ...(line as Record<string, unknown>) }) : draft;

  if (mode === "compose" || !lineId) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        Save the line first to run classification.
      </div>
    );
  }

  return (
    <ClassificationPanel
      line={lineRecord}
      entityCode={parentEntityCode}
      recordId={parentRecordId}
      mode="procure"
    />
  );
}
