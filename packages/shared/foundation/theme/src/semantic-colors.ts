/**
 * @athyper/theme — Semantic Color Resolver
 *
 * Maps generic semantic intents to CSS-variable-backed Tailwind classes.
 * All colors resolve through CSS custom properties from the active preset.
 *
 * SCOPE BOUNDARY:
 *   This module defines GENERIC semantic intents only:
 *     success, warning, error, info, neutral, primary, accent, muted
 *
 *   Business-specific status mapping (e.g. "posted" → success,
 *   "EFFECTIVE" → success, "delegated" → info) belongs in:
 *     packages/metadata-client or packages/entity-runtime
 *
 *   Those layers call resolveSemanticColors(intent) after resolving
 *   the business status to a generic intent via control table or config.
 */

export type SemanticIntent =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "primary"
  | "accent"
  | "muted";

export interface SemanticColorSet {
  /** Background class */
  bg: string;
  /** Foreground/text class */
  text: string;
  /** Border class */
  border: string;
  /** Dot/indicator class */
  dot: string;
  /** Badge shorthand: bg + text combined */
  badge: string;
}

/**
 * Semantic intent → Tailwind class sets.
 * Every class references CSS variables from the active theme preset.
 */
const semanticColorMap: Record<SemanticIntent, SemanticColorSet> = {
  neutral: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    dot: "bg-muted-foreground",
    badge: "bg-muted text-muted-foreground",
  },
  info: {
    bg: "bg-info",
    text: "text-info-foreground",
    border: "border-info",
    dot: "bg-info",
    badge: "bg-info text-info-foreground",
  },
  success: {
    bg: "bg-success",
    text: "text-success-foreground",
    border: "border-success",
    dot: "bg-success",
    badge: "bg-success text-success-foreground",
  },
  warning: {
    bg: "bg-warning",
    text: "text-warning-foreground",
    border: "border-warning",
    dot: "bg-warning",
    badge: "bg-warning text-warning-foreground",
  },
  error: {
    bg: "bg-destructive",
    text: "text-destructive-foreground",
    border: "border-destructive",
    dot: "bg-destructive",
    badge: "bg-destructive text-destructive-foreground",
  },
  primary: {
    bg: "bg-primary",
    text: "text-primary-foreground",
    border: "border-primary",
    dot: "bg-primary",
    badge: "bg-primary text-primary-foreground",
  },
  accent: {
    bg: "bg-accent",
    text: "text-accent-foreground",
    border: "border-accent",
    dot: "bg-accent",
    badge: "bg-accent text-accent-foreground",
  },
  muted: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    dot: "bg-border",
    badge: "bg-muted text-muted-foreground",
  },
};

/** Get the Tailwind class set for a semantic intent. */
export function resolveSemanticColors(intent: SemanticIntent): SemanticColorSet {
  return semanticColorMap[intent];
}

/** All available semantic intents. */
export const SEMANTIC_INTENTS: readonly SemanticIntent[] = [
  "neutral", "info", "success", "warning", "error", "primary", "accent", "muted",
] as const;
