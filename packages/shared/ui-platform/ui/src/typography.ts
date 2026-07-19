/**
 * Semantic typography utility class constants.
 *
 * Use these across all apps (neon, mesh, admin) and shared packages instead of
 * repeating raw Tailwind class strings. Every constant maps to a named role so
 * readers understand intent, not just appearance.
 *
 * Import: `import { LABEL_XS, BODY_SM_MEDIUM } from "@athyper/ui/typography"`
 */

// ── Field & form labels ───────────────────────────────────────────────────────
export const LABEL_XS  = "text-xs font-medium text-muted-foreground" as const;
export const LABEL_SM  = "text-sm font-medium text-muted-foreground" as const;

// ── Section & panel headers ───────────────────────────────────────────────────
export const SECTION_LABEL_XS = "text-xs font-medium text-muted-foreground" as const;
export const SECTION_LABEL_SM = "text-sm font-semibold text-foreground"      as const;

// ── Body / value text ─────────────────────────────────────────────────────────
export const BODY_XS        = "text-xs text-foreground"          as const;
export const BODY_XS_MEDIUM = "text-xs font-medium text-foreground" as const;
export const BODY_SM        = "text-sm text-foreground"          as const;
export const BODY_SM_MEDIUM = "text-sm font-medium text-foreground" as const;

// ── Supporting / meta text ────────────────────────────────────────────────────
export const META_XS = "text-xs text-muted-foreground" as const;
export const META_SM = "text-sm text-muted-foreground" as const;

// ── Page & card headings ──────────────────────────────────────────────────────
export const HEADING_XS = "text-sm font-semibold text-foreground"  as const;
export const HEADING_SM = "text-base font-semibold text-foreground" as const;
export const HEADING_MD = "text-lg font-semibold text-foreground"   as const;
export const HEADING_LG = "text-xl font-semibold text-foreground"   as const;

// ── Inline code / mono text ───────────────────────────────────────────────────
export const MONO_XS = "font-mono text-xs text-foreground" as const;
export const MONO_SM = "font-mono text-sm text-foreground" as const;

// Drawer content — shared by Comments, Attachments, and Activity.
// Normal drawer content follows the Entity Record Details scale; compact
// badges and machine-readable identifiers remain deliberately smaller.
export const DRAWER_SECTION_HEADING = SECTION_LABEL_SM;
export const DRAWER_ITEM_TITLE      = BODY_SM_MEDIUM;
export const DRAWER_LABEL           = LABEL_SM;
export const DRAWER_VALUE           = BODY_SM;
export const DRAWER_META            = META_SM;
export const DRAWER_CONTROL         = "text-sm font-medium text-muted-foreground" as const;
export const DRAWER_TECHNICAL       = MONO_XS;
export const DRAWER_CARD            = "rounded-lg border border-border bg-card" as const;
export const DRAWER_DETAIL_SURFACE  = "rounded-md border border-border bg-muted/40" as const;
