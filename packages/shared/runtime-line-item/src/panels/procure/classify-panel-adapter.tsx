"use client";

import { ClassificationPanel } from "../classification-panel";
import { MetaFieldPanel } from "../meta-field-panel";
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
  ...panelProps
}: LineItemPanelProps) {
  const lineId = recordId(line as LineRecord | null | undefined);
  const lineRecord = line ? ({ ...draft, ...(line as Record<string, unknown>) }) : draft;

  const classificationFields = (
    <MetaFieldPanel
      {...panelProps}
      line={line}
      draft={draft}
      mode={mode}
      parentEntityCode={parentEntityCode}
      recordId={parentRecordId}
      groupKeys={["classification"]}
    />
  );

  if (mode === "compose" || !lineId) {
    return (
      <div className="divide-y divide-border/40">
        {classificationFields}
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Save the line to run the classification pipeline.
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {classificationFields}
      <ClassificationPanel
        line={lineRecord}
        entityCode={parentEntityCode}
        recordId={parentRecordId}
        mode="procure"
      />
    </div>
  );
}
