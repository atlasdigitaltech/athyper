/**
 * @athyper/platform-theme — Badge Visual Primitives
 *
 * Defines the visual variant vocabulary (BadgeVariant) and alert primitives
 * used by the Badge component CVA system.
 *
 * Domain-specific badge kind taxonomy (BadgeKind, BADGE_KIND_VARIANT,
 * BADGE_KIND_LABEL) lives in @athyper/platform-ui/data/record-badge to keep
 * this package free of domain knowledge.
 *
 * Maps AlertSeverity → the existing Badge CVA variant names so no new CSS
 * variables or Tailwind classes are introduced.
 */

// Mirrors the CVA variant names in @athyper/ui/primitives Badge — must stay in sync.
export type BadgeVariant =
  | "default" | "secondary" | "outline"
  | "success" | "warning" | "destructive" | "info" | "muted";

export type AlertSeverity = "info" | "warning" | "critical";

export interface RecordAlert {
  severity:     AlertSeverity;
  message:      string;
  code?:        string;
  action?:      { label: string; href?: string; onClick?: () => void };
  dismissible?: boolean;
}

// ── AlertSeverity → Badge CVA variant (for the alert strip) ──────────────────

export const ALERT_SEVERITY_VARIANT: Record<AlertSeverity, BadgeVariant> = {
  info:     "info",
  warning:  "warning",
  critical: "destructive",
};
