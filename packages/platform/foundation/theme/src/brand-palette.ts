/**
 * Runtime brand palette derivation.
 *
 * Converts a customer's primary hex color into a full set of CSS variable
 * overrides compatible with the theme contract. The output is a delta — only
 * the brand group variables that should differ from the base preset are
 * returned. Apply on top of any shipped preset to produce a tenant-branded
 * theme without touching the surface, semantic, chart, or sidebar structure.
 *
 * Color math: hex → sRGB → linear sRGB → OKLab → OKLCH (no external deps).
 *
 * Dark mode: use generateBrandColorOverrides() which returns separate light
 * and dark CssVariableOverrides sets. Inject the dark set under a
 * `.dark :root` or `[data-theme="dark"] :root` rule, or re-apply via
 * applyBrandOverrides() when dark mode toggles.
 */

// ── Validation ────────────────────────────────────────────────────────────────

function validateHex(raw: string): string {
  const cleaned = raw.trim().replace(/^#/, "");
  if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleaned)) {
    throw new Error(`generateCssVariablesFromBrandColor: invalid hex color "${raw}"`);
  }
  return `#${cleaned.length === 3
    ? cleaned.split("").map(c => c + c).join("")
    : cleaned}`;
}

// ── Hex → OKLCH ──────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToOklch(L: number, a: number, b: number): [number, number, number] {
  const C = Math.sqrt(a * a + b * b);
  const H = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, C, H < 0 ? H + 360 : H];
}

function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const [L, a, bv] = rgbToOklab(r, g, b);
  return oklabToOklch(L, a, bv);
}

function oklch(L: number, C: number, H: number): string {
  return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)})`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Input to the palette derivation function. */
export interface BrandColorInput {
  /** Customer primary brand color in #hex format (3 or 6 digit). */
  primaryHex: string;
  /**
   * Optional accent color in #hex. When omitted, a hue-shifted variant
   * (+30° on the OKLab hue wheel) of the primary is derived automatically.
   */
  accentHex?: string;
}

/**
 * CSS variable override map. Keys are CSS custom property names; values are
 * CSS color strings. Apply on top of any shipped preset.
 *
 * Compatible with React's CSSProperties as a style prop:
 *   `<div style={overrides as React.CSSProperties}>`
 */
export type CssVariableOverrides = { [key: `--${string}`]: string };

/**
 * Light and dark mode brand overrides. Pass `light` to `:root` styles and
 * `dark` to `.dark :root` (or re-apply when dark mode toggles).
 */
export interface BrandColorOverrides {
  light: CssVariableOverrides;
  dark:  CssVariableOverrides;
}

// ── Shared accent resolution ──────────────────────────────────────────────────

function resolveAccent(
  input: BrandColorInput,
  pL: number, pC: number, pH: number,
): { aL: number; aC: number; aH: number } {
  if (input.accentHex) {
    const [aL, aC, aH] = hexToOklch(validateHex(input.accentHex));
    return { aL, aC, aH };
  }
  return {
    aH: (pH + 30) % 360,
    aL: Math.min(pL * 1.05, 0.85),
    // Floor prevents near-achromatic primaries from producing invisible accent hue shifts.
    aC: Math.max(pC * 1.1, 0.08),
  };
}

// ── Light mode derivation ─────────────────────────────────────────────────────

function deriveLightOverrides(
  pL: number, pC: number, pH: number,
  aL: number, aC: number, aH: number,
): CssVariableOverrides {
  const primaryIsLight = pL >= 0.55;
  const primary    = oklch(pL, pC, pH);
  const primaryFg  = primaryIsLight ? oklch(0.15, 0.01, pH) : oklch(0.97, 0.004, pH);

  const secondaryL = Math.min(pL + (primaryIsLight ? 0.18 : 0.38), 0.97);
  const secondary  = oklch(secondaryL, pC * 0.12, pH);
  const secondaryFg = oklch(0.25, 0.015, pH);

  const accent   = oklch(aL, aC, aH);
  const accentFg = aL >= 0.55 ? oklch(0.15, 0.01, aH) : oklch(0.97, 0.004, aH);

  // Ring: slightly lighter, less chromatic primary; floor chroma so it remains visible
  // even for very light primaries that would otherwise produce a near-white ring.
  const ringL = pL >= 0.8 ? Math.max(pL - 0.15, 0.55) : Math.min(pL + 0.08, 0.9);
  const ring  = oklch(ringL, Math.max(pC * 0.75, 0.06), pH);

  return {
    "--primary":                      primary,
    "--primary-foreground":           primaryFg,
    "--secondary":                    secondary,
    "--secondary-foreground":         secondaryFg,
    "--accent":                       accent,
    "--accent-foreground":            accentFg,
    "--ring":                         ring,
    "--sidebar-primary":              primary,
    "--sidebar-primary-foreground":   primaryFg,
    "--sidebar-accent":               secondary,
    "--sidebar-accent-foreground":    secondaryFg,
    "--sidebar-ring":                 ring,
  };
}

// ── Dark mode derivation ──────────────────────────────────────────────────────

function deriveDarkOverrides(
  pL: number, pC: number, pH: number,
  aL: number, aC: number, aH: number,
): CssVariableOverrides {
  // Dark backgrounds need a lighter primary for visibility.
  const darkPL    = pL < 0.5 ? Math.min(pL + 0.30, 0.88) : Math.min(pL + 0.08, 0.92);
  const primary   = oklch(darkPL, pC, pH);
  const primaryFg = darkPL >= 0.55 ? oklch(0.15, 0.01, pH) : oklch(0.97, 0.004, pH);

  // Dark secondary: deep low-chroma surface tint — provides depth without competing with primary.
  const secondary   = oklch(0.22, pC * 0.08, pH);
  const secondaryFg = oklch(0.92, 0.005, pH);

  // Boost accent lightness for dark backgrounds.
  const darkAL   = aL < 0.5 ? Math.min(aL + 0.25, 0.85) : Math.min(aL + 0.06, 0.90);
  const accent   = oklch(darkAL, aC, aH);
  const accentFg = darkAL >= 0.55 ? oklch(0.15, 0.01, aH) : oklch(0.97, 0.004, aH);

  const ring = oklch(Math.min(darkPL + 0.06, 0.88), Math.max(pC * 0.7, 0.06), pH);

  return {
    "--primary":                      primary,
    "--primary-foreground":           primaryFg,
    "--secondary":                    secondary,
    "--secondary-foreground":         secondaryFg,
    "--accent":                       accent,
    "--accent-foreground":            accentFg,
    "--ring":                         ring,
    "--sidebar-primary":              primary,
    "--sidebar-primary-foreground":   primaryFg,
    "--sidebar-accent":               secondary,
    "--sidebar-accent-foreground":    secondaryFg,
    "--sidebar-ring":                 ring,
  };
}

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Generates both light and dark CSS variable overrides for the brand color
 * group. This is the preferred API — inject `light` into `:root` styles and
 * `dark` into `.dark :root` (or re-apply when dark mode class toggles).
 */
export function generateBrandColorOverrides(input: BrandColorInput): BrandColorOverrides {
  const safeHex = validateHex(input.primaryHex);
  const [pL, pC, pH] = hexToOklch(safeHex);
  const { aL, aC, aH } = resolveAccent(input, pL, pC, pH);

  return {
    light: deriveLightOverrides(pL, pC, pH, aL, aC, aH),
    dark:  deriveDarkOverrides(pL, pC, pH, aL, aC, aH),
  };
}

/**
 * Generates CSS variable overrides for the light mode only.
 * For full dark-mode support use `generateBrandColorOverrides()` instead.
 */
export function generateCssVariablesFromBrandColor(
  input: BrandColorInput,
): CssVariableOverrides {
  const safeHex = validateHex(input.primaryHex);
  const [pL, pC, pH] = hexToOklch(safeHex);
  const { aL, aC, aH } = resolveAccent(input, pL, pC, pH);
  return deriveLightOverrides(pL, pC, pH, aL, aC, aH);
}

/**
 * Applies CSS variable overrides directly to a DOM element (typically
 * `document.documentElement`). Safe to call in a React `useEffect`.
 */
export function applyBrandOverrides(
  element: HTMLElement,
  overrides: CssVariableOverrides,
): void {
  for (const [key, value] of Object.entries(overrides)) {
    element.style.setProperty(key, value);
  }
}

/**
 * Removes previously applied brand overrides. Call in the `useEffect`
 * cleanup to restore the base preset on unmount or theme change.
 */
export function removeBrandOverrides(
  element: HTMLElement,
  overrides: CssVariableOverrides,
): void {
  for (const key of Object.keys(overrides)) {
    element.style.removeProperty(key);
  }
}
