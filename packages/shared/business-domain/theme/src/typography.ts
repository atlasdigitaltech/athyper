/**
 * @athyper/theme typography contract.
 *
 * Keep typography close to shadcn/Tailwind defaults. The theme owns the font
 * family and standard Tailwind font-size scale only; components should use
 * plain Tailwind classes such as `text-sm`, `font-medium`, and
 * `text-muted-foreground`.
 */

interface TypeScaleToken {
  size: string;
  lineHeight: string;
}

type TailwindFontSizeValue = [
  string,
  {
    lineHeight: string;
  },
];

const fontSansStack = [
  "var(--font-geist-sans)",
  "var(--font-sans)",
  "Geist",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "sans-serif",
] as const;

const fontMonoStack = [
  "var(--font-geist-mono)",
  "var(--font-mono)",
  "Geist Mono",
  "ui-monospace",
  "SFMono-Regular",
  "Menlo",
  "monospace",
] as const;

export const fontFamilies = {
  sans: fontSansStack,
  mono: fontMonoStack,
  arabic: ["IBM Plex Sans Arabic", "Noto Sans Arabic", "Geist", "system-ui", "sans-serif"],
  tamil: ["Noto Sans Tamil", "Geist", "system-ui", "sans-serif"],
} as const;

export type FontFamilyToken = keyof typeof fontFamilies;

export const typeScale = {
  xs: { size: "0.75rem", lineHeight: "1rem" },
  sm: { size: "0.875rem", lineHeight: "1.25rem" },
  base: { size: "1rem", lineHeight: "1.5rem" },
  lg: { size: "1.125rem", lineHeight: "1.75rem" },
  xl: { size: "1.25rem", lineHeight: "1.75rem" },
  "2xl": { size: "1.5rem", lineHeight: "2rem" },
  "3xl": { size: "1.875rem", lineHeight: "2.25rem" },
  "4xl": { size: "2.25rem", lineHeight: "2.5rem" },
  "5xl": { size: "3rem", lineHeight: "1" },
  "6xl": { size: "3.75rem", lineHeight: "1" },
  "7xl": { size: "4.5rem", lineHeight: "1" },
  "8xl": { size: "6rem", lineHeight: "1" },
  "9xl": { size: "8rem", lineHeight: "1" },
} as const satisfies Record<string, TypeScaleToken>;

export type TypeScaleTokenName = keyof typeof typeScale;

export const documentTypography = {} as const;
export type DocumentTypeTokenName = never;

export const semanticTypography = {} as const;
export type TypographyToken = never;
export const t = {} as Record<TypographyToken, string>;

export const tailwindFontFamilies = Object.fromEntries(
  Object.entries(fontFamilies).map(([name, stack]) => [name, [...stack]]),
) as Record<FontFamilyToken, string[]>;

export const tailwindFontSize = Object.fromEntries(
  Object.entries(typeScale).map(([name, token]) => [
    name,
    [token.size, { lineHeight: token.lineHeight }],
  ]),
) as Record<TypeScaleTokenName, TailwindFontSizeValue>;

export const tailwindDocumentFontSize = {} as Record<`doc-${string}`, TailwindFontSizeValue>;

export function renderTypographyCss(): string {
  return [
    "/*",
    " * Generated from typography.ts.",
    " * No custom typography utilities are generated; use standard Tailwind/shadcn classes.",
    " */",
  ].join("\n");
}
