/**
 * Border radius tokens.
 *
 * All values reference the CSS custom property `--radius` set by each
 * theme preset, ensuring radius scales consistently across themes.
 */
export const radiusTokens = {
  none: "0",
  xs: "calc(var(--radius) - 4px)",
  sm: "calc(var(--radius) - 2px)",
  DEFAULT: "var(--radius)",
  md: "calc(var(--radius) + 2px)",
  lg: "calc(var(--radius) + 4px)",
  xl: "calc(var(--radius) + 8px)",
  "2xl": "calc(var(--radius) + 12px)",
  full: "9999px",
} as const;

/** A border radius token key. */
export type RadiusToken = keyof typeof radiusTokens;
