/**
 * @athyper/theme — Record Badge Taxonomy
 *
 * Controlled vocabulary for child-record badges and alert strips.
 * All child-record renderers (summary_cards_with_drawer) must source badges
 * from this set so that Active, Primary, Verified, Expired are visually
 * consistent across Banking, Tax, Certifications, Coverage, Governance, and
 * future master-detail surfaces.
 *
 * Maps BadgeKind → the existing Badge CVA variant names so no new CSS
 * variables or Tailwind classes are introduced.
 */

// Mirrors the CVA variant names in @athyper/ui/primitives Badge — must stay in sync.
export type BadgeVariant =
  | "default" | "secondary" | "outline"
  | "success" | "warning" | "destructive" | "info" | "muted";

// ── Taxonomy ──────────────────────────────────────────────────────────────────

export type BadgeKind =
  // lifecycle
  | "active" | "inactive" | "archived" | "draft" | "pending"
  // validity
  | "expired" | "expiring_soon" | "not_yet_valid"
  // verification
  | "verified" | "unverified" | "rejected"
  // primacy
  | "primary" | "default"
  // domain-specific
  | "blocked" | "on_hold" | "sanctioned";

export type AlertSeverity = "info" | "warning" | "critical";

export interface RecordAlert {
  severity: AlertSeverity;
  message:  string;
}

// ── BadgeKind → Badge CVA variant ─────────────────────────────────────────────

export const BADGE_KIND_VARIANT: Record<BadgeKind, BadgeVariant> = {
  active:        "success",
  inactive:      "muted",
  archived:      "muted",
  draft:         "muted",
  pending:       "warning",

  expired:       "destructive",
  expiring_soon: "warning",
  not_yet_valid: "info",

  verified:      "success",
  unverified:    "warning",
  rejected:      "destructive",

  primary:       "default",
  default:       "info",

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

  expired:       "Expired",
  expiring_soon: "Expiring Soon",
  not_yet_valid: "Not Yet Valid",

  verified:      "Verified",
  unverified:    "Unverified",
  rejected:      "Rejected",

  primary:       "Primary",
  default:       "Default",

  blocked:       "Blocked",
  on_hold:       "On Hold",
  sanctioned:    "Sanctioned",
};

// ── AlertSeverity → Badge CVA variant (for the alert strip) ──────────────────

export const ALERT_SEVERITY_VARIANT: Record<AlertSeverity, BadgeVariant> = {
  info:     "info",
  warning:  "warning",
  critical: "destructive",
};
