import type { BadgeVariant } from "@athyper/platform-theme/record-badge";

export type { BadgeVariant };

export type BadgeKind =
  // lifecycle
  | "active" | "inactive" | "archived" | "draft" | "pending" | "completed"
  // validity
  | "expired" | "expiring_soon" | "not_yet_valid" | "overdue"
  // verification
  | "verified" | "unverified" | "rejected"
  // primacy
  | "primary"
  // domain-specific
  | "blocked" | "on_hold" | "sanctioned";

export const BADGE_KIND_VARIANT: Record<BadgeKind, BadgeVariant> = {
  active:        "success",
  inactive:      "muted",
  archived:      "muted",
  draft:         "muted",
  pending:       "warning",
  completed:     "success",

  expired:       "destructive",
  expiring_soon: "warning",
  not_yet_valid: "info",
  overdue:       "destructive",

  verified:      "success",
  unverified:    "warning",
  rejected:      "destructive",

  primary:       "default",

  blocked:       "destructive",
  on_hold:       "warning",
  sanctioned:    "destructive",
};

export const BADGE_KIND_LABEL: Record<BadgeKind, string> = {
  active:        "Active",
  inactive:      "Inactive",
  archived:      "Archived",
  draft:         "Draft",
  pending:       "Pending",
  completed:     "Completed",

  expired:       "Expired",
  expiring_soon: "Expiring Soon",
  not_yet_valid: "Not Yet Valid",
  overdue:       "Overdue",

  verified:      "Verified",
  unverified:    "Unverified",
  rejected:      "Rejected",

  primary:       "Primary",

  blocked:       "Blocked",
  on_hold:       "On Hold",
  sanctioned:    "Sanctioned",
};
