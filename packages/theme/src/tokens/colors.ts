/**
 * Semantic color token keys.
 *
 * Each token maps to a CSS custom property (e.g. `--primary`).
 * Actual values are set per-preset via CSS files in `styles/presets/`;
 * these keys serve as the type-safe contract between theme presets
 * and consuming components.
 */
export const colorTokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "info",
  "info-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "categorical-1",
  "categorical-2",
  "categorical-3",
  "categorical-4",
  "categorical-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

/** A semantic color token name. */
export type ColorToken = (typeof colorTokens)[number];
