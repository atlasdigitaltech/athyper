"use client";

import { useMemo } from "react";
import { Lock } from "lucide-react";
import type { FieldMask, LockedFieldReason } from "@athyper/api-contracts/document-edit-draft";
import { lockReasonMessage, titleCaseStatus } from "@athyper/runtime-shared";

/**
 * Banner shown at the top of the form when edit mode is active and at least
 * one field is locked by the server-side field mask. Communicates *why* the
 * form is partially read-only, so users stop hunting for the missing
 * affordances.
 *
 * Copy patterns:
 *   1 field, 1 reason  → "1 field is locked while Partially Paid."
 *   N fields, 1 reason → "5 fields are locked while Partially Paid."
 *   N fields, multiple → "5 fields cannot be edited. Reasons: locked while Partially Paid, hidden — contains sensitive data."
 *
 * Renders nothing when `fieldMask` has no locked entries (greenfield create
 * mode, or a status where every field is editable).
 */
export interface LimitedEditBannerProps {
  fieldMask: FieldMask;
  /** Current record status (raw code, e.g. "partially_paid"). */
  status?: string | null;
  className?: string;
}

export function LimitedEditBanner({ fieldMask, status, className }: LimitedEditBannerProps) {
  const summary = useMemo(() => buildSummary(fieldMask, status), [fieldMask, status]);
  if (!summary) return null;
  return (
    <div
      role="status"
      className={[
        "flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10",
        "px-3 py-2 text-xs text-warning",
        className ?? "",
      ].filter(Boolean).join(" ")}
    >
      <Lock className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="leading-snug">
        <span className="font-medium">Limited edit mode:</span> {summary}
      </p>
    </div>
  );
}

function buildSummary(fieldMask: FieldMask, status: string | null | undefined): string | null {
  const lockedEntries = Object.entries(fieldMask)
    .filter(([, entry]) => entry.editable === false && entry.reason)
    .map(([, entry]) => ({
      reason: entry.reason as LockedFieldReason,
      serverMessage: entry.message,
    }));

  if (lockedEntries.length === 0) return null;

  const statusLabel = status && status.length > 0 ? titleCaseStatus(status) : undefined;
  const distinctReasons = new Map<string, string>();
  for (const entry of lockedEntries) {
    const msg = lockReasonMessage(entry.reason, { statusLabel, serverMessage: entry.serverMessage });
    if (!distinctReasons.has(msg)) distinctReasons.set(msg, msg);
  }

  const count = lockedEntries.length;
  const noun  = count === 1 ? "field is" : "fields are";

  if (distinctReasons.size === 1) {
    const only = distinctReasons.values().next().value as string;
    // Lowercase the leading capital so "Locked while Partially Paid" reads
    // grammatically inside the sentence ("5 fields are locked while…").
    const inlineReason = only.charAt(0).toLowerCase() + only.slice(1);
    return `${count} ${noun} ${inlineReason}.`;
  }

  const reasonList = [...distinctReasons.values()]
    .map((r) => r.charAt(0).toLowerCase() + r.slice(1))
    .join(", ");
  return `${count} ${noun} read-only. Reasons: ${reasonList}.`;
}

