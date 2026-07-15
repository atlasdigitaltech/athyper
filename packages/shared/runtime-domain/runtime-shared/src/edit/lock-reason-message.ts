/**
 * Lock-reason message helper
 *
 * Single source of truth for converting `LockedFieldReason` codes from the
 * document workspace field mask into user-facing copy. Used by:
 *
 *   - field-level lock tooltip in runtime-canvas/surfaces/fields-surface.tsx
 *   - LimitedEditBanner above the form in runtime-canvas/edit/limited-edit-banner.tsx
 *
 * Server may populate `FieldMaskEntry.message` with a richer per-field message;
 * when present, that wins over the generic copy here (passed via
 * `LockReasonContext.serverMessage`).
 *
 * `status_locked` is parameterized: pass `statusLabel` (Title Case, e.g.
 * "Partially Paid") to produce "Locked while Partially Paid". Without a
 * statusLabel, falls back to the generic "Locked by current status".
 */

import type { LockedFieldReason } from "@athyper/api-contracts/document-edit-draft";

export interface LockReasonContext {
  /** Current record status, Title Case (e.g. "Partially Paid"). */
  statusLabel?: string;
  /** Optional server-provided override; takes precedence when present. */
  serverMessage?: string;
}

export function lockReasonMessage(
  code: LockedFieldReason,
  context?: LockReasonContext,
): string {
  if (context?.serverMessage && context.serverMessage.trim().length > 0) {
    return context.serverMessage;
  }
  switch (code) {
    case "status_locked":
      return context?.statusLabel
        ? `Locked while ${context.statusLabel}`
        : "Locked by current status";
    case "permission_locked":
      return "You don't have permission to edit this";
    case "pii_masked":
      return "Hidden — contains sensitive data";
    case "readonly":
      return "Read-only field";
    case "computed":
      return "Calculated automatically";
    case "system":
      return "Managed by the system";
    default:
      // Exhaustive over LockedFieldReason at compile time; this branch
      // covers a future enum addition that hasn't shipped a message yet.
      return "Read-only field";
  }
}

/**
 * Title-case a snake_case or kebab-case status code. Use when the descriptor
 * doesn't carry a lifecycle-mask label for the current status.
 *
 *   titleCaseStatus("partially_paid") → "Partially Paid"
 *   titleCaseStatus("pending-approval") → "Pending Approval"
 */
export function titleCaseStatus(raw: string): string {
  return raw
    .split(/[_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
