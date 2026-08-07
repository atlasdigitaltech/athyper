/**
 * @athyper/platform-theme — Semantic Color Resolver
 *
 * Maps generic semantic intents to CSS-variable-backed Tailwind classes.
 * All colors resolve through CSS custom properties from the active preset.
 *
 * SCOPE BOUNDARY:
 *   This module defines GENERIC semantic intents only:
 *     success, warning, error, info, neutral, primary, accent, muted
 *
 *   Business-specific status mapping belongs in:
 *     metadata clients, runtime descriptors, or app/domain runtime packages.
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
  /** Badge shorthand: bg + text combined (full saturation) */
  badge: string;
  /**
   * Subtle badge: low-opacity background + semantic text + faint border.
   * Uses Tailwind opacity modifiers (e.g. bg-success/10) so it automatically
   * adapts to all theme presets and dark mode without extra CSS variables.
   */
  subtleBadge: string;
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
    subtleBadge: "bg-muted text-muted-foreground border-border",
  },
  info: {
    bg: "bg-info",
    text: "text-info-foreground",
    border: "border-info",
    dot: "bg-info",
    badge: "bg-info text-info-foreground",
    subtleBadge: "bg-info/10 text-info border-info/30",
  },
  success: {
    bg: "bg-success",
    text: "text-success-foreground",
    border: "border-success",
    dot: "bg-success",
    badge: "bg-success text-success-foreground",
    subtleBadge: "bg-success/10 text-success border-success/30",
  },
  warning: {
    bg: "bg-warning",
    text: "text-warning-foreground",
    border: "border-warning",
    dot: "bg-warning",
    badge: "bg-warning text-warning-foreground",
    subtleBadge: "bg-warning/10 text-warning border-warning/30",
  },
  error: {
    bg: "bg-destructive",
    text: "text-destructive-foreground",
    border: "border-destructive",
    dot: "bg-destructive",
    badge: "bg-destructive text-destructive-foreground",
    subtleBadge: "bg-destructive/10 text-destructive border-destructive/30",
  },
  primary: {
    bg: "bg-primary",
    text: "text-primary-foreground",
    border: "border-primary",
    dot: "bg-primary",
    badge: "bg-primary text-primary-foreground",
    subtleBadge: "bg-primary/10 text-primary border-primary/30",
  },
  accent: {
    bg: "bg-accent",
    text: "text-accent-foreground",
    border: "border-accent",
    dot: "bg-accent",
    badge: "bg-accent text-accent-foreground",
    subtleBadge: "bg-accent/10 text-accent border-accent/30",
  },
  muted: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    dot: "bg-border",
    badge: "bg-muted text-muted-foreground",
    subtleBadge: "bg-muted/60 text-muted-foreground border-border",
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
