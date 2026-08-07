/**
 * @athyper/platform-theme typography contract.
 *
 * Defines the font family stacks, type scale, weight, and tracking tokens used
 * across all Athyper planes. Components should use plain Tailwind classes
 * (`text-sm`, `font-medium`, `tracking-tight`) rather than importing tokens
 * directly.
 *
 * `renderTypographyCss()` generates `typography.generated.css` — a CSS custom
 * property sheet that non-Tailwind consumers (Keycloak IAM templates, e-mail
 * stylesheets, maintenance pages) can include as a standalone stylesheet.
 */

interface TypeScaleToken {
  size: string;
  lineHeight: string;
  letterSpacing?: string;
}

type TailwindFontSizeValue = [string, { lineHeight: string; letterSpacing?: string }];

// ── Font families ─────────────────────────────────────────────────────────────

const fontSansStack = [
  "var(--font-geist-sans)",
  "var(--font-sans)",
  "Geist",
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "sans-serif",
] as const;

// BlinkMacSystemFont omitted — deprecated since Chromium 92; -apple-system covers it.

const fontMonoStack = [
  "var(--font-geist-mono)",
  "var(--font-mono)",
  "Geist Mono",
  "ui-monospace",
  "Cascadia Code",
  "Consolas",
  "SFMono-Regular",
  "Menlo",
  "monospace",
] as const;

export const fontFamilies = {
  sans:   fontSansStack,
  mono:   fontMonoStack,
  arabic: ["IBM Plex Sans Arabic", "Noto Kufi Arabic", "Noto Sans Arabic", "Geist", "Arial", "system-ui", "sans-serif"],
  tamil:  ["Noto Sans Tamil", "Latha", "Geist", "system-ui", "sans-serif"],
} as const;

export type FontFamilyToken = keyof typeof fontFamilies;

// ── Type scale ────────────────────────────────────────────────────────────────
//
// Sized up from Tailwind defaults: sm → 15px, base → 17px, lg/xl scaled
// proportionally. Display sizes (3xl+) keep original rem values but gain
// tighter letter-spacing and corrected line-heights.
//
// letterSpacing rationale:
//   - Small text (xs/sm): positive tracking improves legibility at small sizes.
//   - Body (base): neutral — optical zero.
//   - Subheadings (lg/xl/2xl): slight negative tracking tightens Geist's wide
//     geometric apertures, matching how Geist is designed to be set.
//   - Display (3xl+): tight negative tracking — standard for geometric sans at
//     large sizes; prevents letterforms from feeling too spaced out.

export const typeScale = {
  xs:    { size: "0.75rem",   lineHeight: "1.125rem", letterSpacing: "0.02em"   },
  sm:    { size: "0.9375rem", lineHeight: "1.5rem",   letterSpacing: "0.01em"   },
  base:  { size: "1.0625rem", lineHeight: "1.625rem", letterSpacing: "0em"      },
  lg:    { size: "1.1875rem", lineHeight: "1.875rem", letterSpacing: "-0.01em"  },
  xl:    { size: "1.3125rem", lineHeight: "2rem",     letterSpacing: "-0.015em" },
  "2xl": { size: "1.5rem",    lineHeight: "2rem",     letterSpacing: "-0.02em"  },
  "3xl": { size: "1.875rem",  lineHeight: "1.1",      letterSpacing: "-0.025em" },
  "4xl": { size: "2.25rem",   lineHeight: "1.05",     letterSpacing: "-0.03em"  },
  "5xl": { size: "3rem",      lineHeight: "1",        letterSpacing: "-0.04em"  },
  "6xl": { size: "3.75rem",   lineHeight: "1",        letterSpacing: "-0.04em"  },
  "7xl": { size: "4.5rem",    lineHeight: "1",        letterSpacing: "-0.04em"  },
  "8xl": { size: "6rem",      lineHeight: "1",        letterSpacing: "-0.04em"  },
  "9xl": { size: "8rem",      lineHeight: "1",        letterSpacing: "-0.04em"  },
} as const satisfies Record<string, TypeScaleToken>;

export type TypeScaleTokenName = keyof typeof typeScale;

// ── Font weights ──────────────────────────────────────────────────────────────

export const fontWeights = {
  light:     "300",
  regular:   "400",
  medium:    "500",
  semibold:  "600",
  bold:      "700",
  extrabold: "800",
} as const;

export type FontWeightToken = keyof typeof fontWeights;

// ── Letter-spacing (tracking) tokens ─────────────────────────────────────────
//
// Named aliases for the em-based tracking values used in the type scale.
// Prefer these over raw em values in component classes for semantic clarity.

export const fontTracking = {
  tightest: "-0.04em",
  tighter:  "-0.025em",
  tight:    "-0.01em",
  normal:   "0em",
  wide:     "0.01em",
  wider:    "0.02em",
} as const;

export type FontTrackingToken = keyof typeof fontTracking;

// ── Tailwind integration ──────────────────────────────────────────────────────

export const tailwindFontFamilies = Object.fromEntries(
  Object.entries(fontFamilies).map(([name, stack]) => [name, [...stack]]),
) as Record<FontFamilyToken, string[]>;

export const tailwindFontSize = Object.fromEntries(
  Object.entries(typeScale).map(([name, { size, lineHeight, letterSpacing }]) => [
    name,
    [size, { lineHeight, ...(letterSpacing !== undefined ? { letterSpacing } : {}) }] as TailwindFontSizeValue,
  ]),
) as Record<TypeScaleTokenName, TailwindFontSizeValue>;

export const tailwindFontWeight = Object.fromEntries(
  Object.entries(fontWeights).map(([name, value]) => [name, value]),
) as Record<FontWeightToken, string>;

export const tailwindLetterSpacing = Object.fromEntries(
  Object.entries(fontTracking).map(([name, value]) => [name, value]),
) as Record<FontTrackingToken, string>;

// ── CSS generation (for non-Tailwind consumers) ───────────────────────────────

/**
 * Generates a CSS custom-property stylesheet from the typography contract.
 * Output is written to `typography.generated.css` and consumed by IAM
 * templates and other non-Tailwind surfaces.
 *
 * @example
 * // scripts/typography.generate.ts
 * import { renderTypographyCss } from "./typography";
 * writeFileSync("src/typography.generated.css", renderTypographyCss());
 */
export function renderTypographyCss(): string {
  const fontVars = Object.entries(fontFamilies)
    .map(([name, stack]) => `  --font-${name}: ${[...stack].join(", ")};`)
    .join("\n");

  const sizeVars = Object.entries(typeScale)
    .flatMap(([name, { size, lineHeight, letterSpacing }]) => [
      `  --text-${name}: ${size};`,
      `  --text-${name}--line-height: ${lineHeight};`,
      ...(letterSpacing !== undefined ? [`  --text-${name}--letter-spacing: ${letterSpacing};`] : []),
    ])
    .join("\n");

  const weightVars = Object.entries(fontWeights)
    .map(([name, value]) => `  --font-weight-${name}: ${value};`)
    .join("\n");

  const trackingVars = Object.entries(fontTracking)
    .map(([name, value]) => `  --tracking-${name}: ${value};`)
    .join("\n");

  return [
    "/* Generated by @athyper/platform-theme/typography.ts — do not edit directly. */",
    "/* Run: pnpm typography:generate                                       */",
    ":root {",
    fontVars,
    "",
    sizeVars,
    "",
    weightVars,
    "",
    trackingVars,
    "}",
    "",
  ].join("\n");
}
