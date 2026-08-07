/**
 * Semantic typography utility class constants.
 *
 * Use these across all apps (neon, mesh, admin) and shared packages instead of
 * repeating raw Tailwind class strings. Every constant maps to a named role so
 * readers understand intent, not just appearance.
 *
 * Import: `import { LABEL_XS, BODY_SM_MEDIUM } from "@athyper/platform-ui/typography"`
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
