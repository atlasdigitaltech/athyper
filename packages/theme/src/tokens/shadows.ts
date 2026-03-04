/**
 * Shadow tokens.
 *
 * All values reference CSS custom properties (`--shadow-*`) set by each
 * theme preset. Shadow intensity adapts automatically to light/dark mode.
 */
export const shadowTokens = {
  "2xs": "var(--shadow-2xs)",
  xs: "var(--shadow-xs)",
  sm: "var(--shadow-sm)",
  DEFAULT: "var(--shadow)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)",
  "2xl": "var(--shadow-2xl)",
} as const;

/** A shadow token key. */
export type ShadowToken = keyof typeof shadowTokens;
