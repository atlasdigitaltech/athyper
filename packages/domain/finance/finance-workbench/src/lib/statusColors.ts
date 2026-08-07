/**
 * Finance document status → Tailwind text-class helper.
 *
 * Use this instead of per-file STATUS_COLORS objects. All views share a single
 * mapping so adding a new status (e.g. "partially_paid") only needs one edit.
 *
 * For full SemanticIntent badge rendering (bg + border) use
 * `resolveSemanticColors` from @athyper/platform-theme/semantic-colors.
 */

const STATUS_CLASS_MAP: Record<string, string> = {
  draft:           "text-muted-foreground",
  submitted:       "text-primary",
  in_review:       "text-primary",
  pending_approval:"text-primary",
  on_hold:         "text-warning",
  approved:        "text-success",
  posted:          "text-success font-medium",
  paid:            "text-success",
  fully_paid:      "text-success",
  partially_paid:  "text-warning font-medium",
  overdue:         "text-destructive font-medium",
  rejected:        "text-destructive",
  voided:          "text-muted-foreground line-through",
  cancelled:       "text-muted-foreground line-through",
  reversed:        "text-muted-foreground line-through",
  closed:          "text-success",
};

/**
 * Returns the Tailwind text utility class(es) for a finance document status.
 * Fallback: `text-muted-foreground` for unknown statuses.
 */
export function statusTextClass(status: string): string {
  return STATUS_CLASS_MAP[status.toLowerCase()] ?? "text-muted-foreground";
}
