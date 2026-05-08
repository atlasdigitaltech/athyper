/**
 * @athyper/theme typography contract.
 *
 * Raw numeric type values live here. Tailwind config, CSS variables, and
 * semantic class tokens are derived from this file so the platform does not
 * maintain parallel scales by hand.
 */

type FontWeightValue = 400 | 500 | 600 | 700;

interface TypeScaleToken {
  size: string;
  lineHeight: string;
}

interface DocumentTypeToken {
  size: string;
  lineHeight: string;
  fontWeight: FontWeightValue;
  letterSpacing?: string;
}

interface SemanticTypeToken {
  size: TypeScaleTokenName | DocumentTypeTokenName;
  fontWeight: FontWeightValue;
  lineHeight: "tight" | "snug" | "normal";
  color: "foreground" | "muted-foreground";
  fontFamily?: "sans" | "mono" | "serif";
}

const uiFontStack = [
  "var(--font-geist-sans)",
  "Geist",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "sans-serif",
] as const;

export const fontFamilies = {
  sans: uiFontStack,
  mono: uiFontStack,
  serif: uiFontStack,
  arabic: ["IBM Plex Sans Arabic", "Noto Sans Arabic", "Geist", "system-ui", "sans-serif"],
  tamil: ["Noto Sans Tamil", "Geist", "system-ui", "sans-serif"],
} as const;

export type FontFamilyToken = keyof typeof fontFamilies;

export const typeScale = {
  "2xs": { size: "0.625rem", lineHeight: "0.875rem" },
  xs: { size: "0.75rem", lineHeight: "1rem" },
  sm: { size: "0.8125rem", lineHeight: "1.25rem" },
  base: { size: "0.875rem", lineHeight: "1.375rem" },
  md: { size: "0.9375rem", lineHeight: "1.5rem" },
  lg: { size: "1rem", lineHeight: "1.5rem" },
  xl: { size: "1.125rem", lineHeight: "1.75rem" },
  "2xl": { size: "1.25rem", lineHeight: "1.875rem" },
  "3xl": { size: "1.5rem", lineHeight: "2rem" },
  "4xl": { size: "1.875rem", lineHeight: "2.25rem" },
  "5xl": { size: "2.25rem", lineHeight: "2.75rem" },
  "display-auth": { size: "2.2rem", lineHeight: "1.15" },
} as const satisfies Record<string, TypeScaleToken>;

export type TypeScaleTokenName = keyof typeof typeScale;

export const documentTypography = {
  number: {
    size: "0.8125rem",
    lineHeight: "1.2",
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  subtitle: {
    size: "0.6875rem",
    lineHeight: "1.4",
    fontWeight: 400,
  },
  badge: {
    size: "0.6875rem",
    lineHeight: "1",
    fontWeight: 600,
  },
  fieldLabel: {
    size: "0.5625rem",
    lineHeight: "1",
    fontWeight: 600,
    letterSpacing: "0.10em",
  },
  compactCode: {
    size: "0.5rem",
    lineHeight: "1",
    fontWeight: 500,
    letterSpacing: "0.04em",
  },
  fieldValue: {
    size: "0.75rem",
    lineHeight: "1.2",
    fontWeight: 600,
  },
  amount: {
    size: "0.75rem",
    lineHeight: "1.2",
    fontWeight: 700,
    letterSpacing: "-0.005em",
  },
  support: {
    size: "0.625rem",
    lineHeight: "1.4",
    fontWeight: 400,
  },
  action: {
    size: "0.71875rem",
    lineHeight: "1",
    fontWeight: 600,
  },
} as const satisfies Record<string, DocumentTypeToken>;

export type DocumentTypeTokenName = keyof typeof documentTypography;

const documentTypographyEntries = Object.entries(documentTypography) as Array<
  [DocumentTypeTokenName, DocumentTypeToken]
>;

export const semanticTypography = {
  title: {
    size: "2xl",
    fontWeight: 600,
    lineHeight: "tight",
    color: "foreground",
  },
  docNo: {
    size: "lg",
    fontWeight: 600,
    lineHeight: "tight",
    color: "foreground",
  },
  amount: {
    size: "xl",
    fontWeight: 600,
    lineHeight: "tight",
    color: "foreground",
    fontFamily: "mono",
  },
  body: {
    size: "base",
    fontWeight: 400,
    lineHeight: "snug",
    color: "foreground",
  },
  label: {
    size: "xs",
    fontWeight: 500,
    lineHeight: "normal",
    color: "muted-foreground",
  },
  meta: {
    size: "xs",
    fontWeight: 400,
    lineHeight: "normal",
    color: "muted-foreground",
  },
  micro: {
    size: "subtitle",
    fontWeight: 400,
    lineHeight: "normal",
    color: "muted-foreground",
  },
} as const satisfies Record<string, SemanticTypeToken>;

export type TypographyToken = keyof typeof semanticTypography;

type TailwindFontSizeValue = [
  string,
  {
    lineHeight: string;
    letterSpacing?: string;
  },
];

function docClassName(name: DocumentTypeTokenName): string {
  return name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function textClassName(size: TypeScaleTokenName | DocumentTypeTokenName): string {
  if (size in documentTypography) return `text-doc-${docClassName(size as DocumentTypeTokenName)}`;
  return `text-${size}`;
}

function fontWeightClass(fontWeight: FontWeightValue): string {
  switch (fontWeight) {
    case 400:
      return "font-normal";
    case 500:
      return "font-medium";
    case 600:
      return "font-semibold";
    case 700:
      return "font-bold";
  }
}

function semanticClassName(token: SemanticTypeToken): string {
  return [
    textClassName(token.size),
    fontWeightClass(token.fontWeight),
    `leading-${token.lineHeight}`,
    token.fontFamily ? `font-${token.fontFamily}` : undefined,
    `text-${token.color}`,
  ].filter(Boolean).join(" ");
}

export const t = Object.fromEntries(
  Object.entries(semanticTypography).map(([name, token]) => [name, semanticClassName(token)]),
) as Record<TypographyToken, string>;

export const tailwindFontFamilies = Object.fromEntries(
  Object.entries(fontFamilies).map(([name, stack]) => [name, [...stack]]),
) as Record<FontFamilyToken, string[]>;

export const tailwindFontSize = Object.fromEntries(
  Object.entries(typeScale).map(([name, token]) => [
    name,
    [token.size, { lineHeight: token.lineHeight }],
  ]),
) as Record<TypeScaleTokenName, TailwindFontSizeValue>;

export const tailwindDocumentFontSize = Object.fromEntries(
  documentTypographyEntries.map(([name, token]) => [
    `doc-${docClassName(name)}`,
    [
      token.size,
      {
        lineHeight: token.lineHeight,
        ...(token.letterSpacing ? { letterSpacing: token.letterSpacing } : {}),
      },
    ],
  ]),
) as Record<`doc-${string}`, TailwindFontSizeValue>;

function cssVariableStem(name: DocumentTypeTokenName): string {
  return `--doc-${docClassName(name)}`;
}

const denseTextAliases = {
  label: "fieldLabel",
  support: "support",
  subtitle: "subtitle",
} as const satisfies Record<string, DocumentTypeTokenName>;

export function renderTypographyCss(): string {
  const lines = [
    "/*",
    " * Generated from typography.ts.",
    " * Run `pnpm --filter @athyper/theme run typography:generate` after changing tokens.",
    " */",
    "",
    ":root {",
  ];

  documentTypographyEntries.forEach(([name, token], index) => {
    const stem = cssVariableStem(name);
    lines.push(`  ${stem}-size: ${token.size};`);
    lines.push(`  ${stem}-line-height: ${token.lineHeight};`);
    lines.push(`  ${stem}-weight: ${token.fontWeight};`);
    if (token.letterSpacing) {
      lines.push(`  ${stem}-tracking: ${token.letterSpacing};`);
    }
    if (index < documentTypographyEntries.length - 1) lines.push("");
  });

  lines.push("}");
  lines.push("");
  lines.push("@layer utilities {");

  for (const [name, token] of documentTypographyEntries) {
    const stem = cssVariableStem(name);
    lines.push(`  .text-doc-${docClassName(name)} {`);
    lines.push(`    font-size: var(${stem}-size);`);
    lines.push(`    line-height: var(${stem}-line-height);`);
    if (token.letterSpacing) {
      lines.push(`    letter-spacing: var(${stem}-tracking);`);
    }
    lines.push("  }");
    lines.push("");
  }

  const denseAliasEntries = Object.entries(denseTextAliases) as Array<
    [string, DocumentTypeTokenName]
  >;

  for (const [alias, tokenName] of denseAliasEntries) {
    if (alias === docClassName(tokenName)) continue;
    const stem = cssVariableStem(tokenName);
    const token = documentTypography[tokenName] as DocumentTypeToken;
    lines.push(`  .text-doc-${alias} {`);
    lines.push(`    font-size: var(${stem}-size);`);
    lines.push(`    line-height: var(${stem}-line-height);`);
    if (token.letterSpacing) {
      lines.push(`    letter-spacing: var(${stem}-tracking);`);
    }
    lines.push("  }");
    lines.push("");
  }

  if (lines[lines.length - 1] === "") lines.pop();
  lines.push("}");

  return lines.join("\n");
}
