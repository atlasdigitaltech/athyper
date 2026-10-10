import { ATLAS_MODERN_BRAND, ATLAS_MONO_BRAND } from "@athyper/platform-brand";

export const THEME_FAMILIES = [ATLAS_MODERN_BRAND.id, ATLAS_MONO_BRAND.id] as const;
export type ThemeFamily = (typeof THEME_FAMILIES)[number];
export const DEFAULT_THEME_FAMILY: ThemeFamily = ATLAS_MODERN_BRAND.id;

export function isThemeFamily(value: unknown): value is ThemeFamily {
  return typeof value === "string" && (THEME_FAMILIES as readonly string[]).includes(value);
}

export const COLOR_MODES = ["light", "dark", "high-contrast"] as const;
export const DENSITY_MODES = ["compact", "comfortable", "spacious"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export type DensityMode = (typeof DENSITY_MODES)[number];
export type ThemePreference = ColorMode | "system";

/** The one responsive scale, in rem. CSS cannot read custom properties inside
 * `@media` or `@container` preludes, so stylesheets write these literals and
 * `policy:ui-system` checks every width query against this list.
 * compact: a component inside a side panel at its narrowest (panels are
 * 22.5-35rem wide); container queries only, never the viewport.
 * narrow: phone content; medium: overlays and page chrome; wide: desktop
 * content; extraWide: room for a pinned side panel beside wide content. */
export const BREAKPOINT_SCALE = Object.freeze({ compact: 24, narrow: 40, medium: 48, wide: 64, extraWide: 80 });
export type BreakpointName = keyof typeof BREAKPOINT_SCALE;
/** Tiers that describe a component's container, never the viewport. */
export const CONTAINER_ONLY_BREAKPOINTS: readonly BreakpointName[] = Object.freeze(["compact"]);
/** Starlight accents for the docs sites in dark mode (build-docs-css.ts): they keep
 * the brand hue (~215°) recognisable on a dark ground, where a plain mix toward
 * white turns the brand into a pale lavender-grey. */
export const DOCS_DARK_ACCENT = Object.freeze({ accent: "#5b86c9", accentHigh: "#93b3e6" });

export type ViewportBreakpoint = Exclude<BreakpointName, "compact">;
/** A viewport media query on the scale, for `matchMedia` in components, so script
 * and stylesheet change layout at the same width: `{ below: "medium" }` is
 * "(width < 48rem)", `{ from: "medium", below: "extraWide" }` is
 * "(48rem <= width < 80rem)". */
export function viewportQuery({ from, below }: { readonly from?: ViewportBreakpoint; readonly below?: ViewportBreakpoint }): string {
  const start = from && `${BREAKPOINT_SCALE[from]}rem`, end = below && `${BREAKPOINT_SCALE[below]}rem`;
  if (start && end) return `(${start} <= width < ${end})`;
  if (start) return `(width >= ${start})`;
  if (end) return `(width < ${end})`;
  throw new TypeError("viewportQuery needs from, below or both");
}

/** Read by the blocking ThemeScript before first paint; keep in sync with any client-side preference writer. */
export const THEME_STORAGE_KEY = "athyper.theme";
export const DENSITY_STORAGE_KEY = "athyper.density";
export const THEME_FAMILY_STORAGE_KEY = "athyper.themeFamily";

export const REQUIRED_COLOR_TOKENS = [
  "background",
  "foreground",
  "surface",
  "surfaceRaised",
  "muted",
  "mutedForeground",
  "border",
  "input",
  "primary",
  "primaryForeground",
  "primaryHover",
  "selectionStrong",
  "selectionStrongForeground",
  "selectionSubtle",
  "selectionSubtleForeground",
  "panelBackground",
  "panelHeaderBackground",
  "panelToolbarBackground",
  "danger",
  "dangerForeground",
  "warning",
  "warningForeground",
  "success",
  "successForeground",
  "focus",
  "scrim",
  "contrast",
  "contrastForeground",
  "warningSubtle",
  "warningSubtleForeground",
  "dangerSubtle",
  "dangerSubtleForeground",
  "successSubtle",
  "successSubtleForeground",
  "brand",
  "brandForeground",
  "brandHover",
  "brandSoft",
  "storyStart",
  "storyEnd",
  "storyForeground",
  "storyMuted",
  "storyEyebrow",
  "storyWave",
  "storyWaveBright",
  "storyGlow",
  "storyDot",
  "storyBorder",
  "storySurface",
  "storySurfaceHover",
  "storySurfaceActive",
  "storySelectionBorder",
  "storyFocus",
  "storyDanger",
  "storyDangerForeground",
  "storyWarning",
  "storyWarningForeground",
  "storySuccess",
  "storySuccessForeground",
  "storyContrast",
  "storyContrastForeground",
] as const;

export type ColorToken = (typeof REQUIRED_COLOR_TOKENS)[number];
export type ColorTokenSet = Readonly<Record<ColorToken, string>>;

export const COLOR_TOKENS: Readonly<Record<ColorMode, ColorTokenSet>> =
  Object.freeze({
    light: Object.freeze({
      background: "#f8fafc",
      foreground: "#172033",
      surface: "#ffffff",
      surfaceRaised: "#ffffff",
      muted: "#eef2f7",
      mutedForeground: "#5b6578",
      border: "#d5dce7",
      input: "#aab4c5",
      primary: "var(--a-brand)",
      primaryForeground: "var(--a-brand-foreground)",
      primaryHover: "var(--a-brand-hover)",
      selectionStrong: "var(--a-primary)",
      selectionStrongForeground: "var(--a-primary-foreground)",
      selectionSubtle: "var(--a-brand-soft)",
      selectionSubtleForeground: "var(--a-primary)",
      panelBackground: "var(--a-surface)",
      panelHeaderBackground: "var(--a-surface)",
      panelToolbarBackground: "var(--a-muted)",
      danger: "#b42318",
      dangerForeground: "#ffffff",
      warning: "#b54708",
      warningForeground: "#ffffff",
      success: "#067647",
      successForeground: "#ffffff",
      focus: "#2e90fa",
      scrim: "rgb(15 23 42 / 0.58)",
      contrast: "#151515",
      contrastForeground: "#ffffff",
      warningSubtle: "#fff8eb",
      warningSubtleForeground: "#172033",
      dangerSubtle: "#fef3f2",
      dangerSubtleForeground: "#172033",
      successSubtle: "#ecfdf3",
      successSubtleForeground: "#172033",
      brand: ATLAS_MODERN_BRAND.colors.primary,
      brandForeground: ATLAS_MODERN_BRAND.colors.primaryForeground,
      brandHover: ATLAS_MODERN_BRAND.colors.primaryHover,
      brandSoft: ATLAS_MODERN_BRAND.colors.primarySoft,
      storyStart: ATLAS_MODERN_BRAND.colors.storyStart,
      storyEnd: ATLAS_MODERN_BRAND.colors.storyEnd,
      storyForeground: ATLAS_MODERN_BRAND.colors.storyForeground,
      storyMuted: ATLAS_MODERN_BRAND.colors.storyMuted,
      storyEyebrow: ATLAS_MODERN_BRAND.colors.storyEyebrow,
      storyWave: ATLAS_MODERN_BRAND.colors.storyWave,
      storyWaveBright: ATLAS_MODERN_BRAND.colors.storyWaveBright,
      storyGlow: ATLAS_MODERN_BRAND.colors.storyGlow,
      storyDot: ATLAS_MODERN_BRAND.colors.storyDot,
      storyBorder:
        "color-mix(in srgb, var(--a-story-foreground) 14%, transparent)",
      storySurface:
        "color-mix(in srgb, var(--a-story-foreground) 6%, transparent)",
      storySurfaceHover:
        "color-mix(in srgb, var(--a-story-foreground) 10%, transparent)",
      storySurfaceActive:
        "color-mix(in srgb, var(--a-story-wave) 22%, transparent)",
      storySelectionBorder:
        "color-mix(in srgb, var(--a-story-wave-bright) 38%, transparent)",
      storyFocus: "#2e90fa",
      storyDanger: "#b42318",
      storyDangerForeground: "#ffffff",
      storyWarning: "#b54708",
      storyWarningForeground: "#ffffff",
      storySuccess: "#067647",
      storySuccessForeground: "#ffffff",
      storyContrast: "#151515",
      storyContrastForeground: "#ffffff",
    }),
    dark: Object.freeze({
      background: "#0b1220",
      foreground: "#e8edf5",
      surface: "#111b2e",
      surfaceRaised: "#17243a",
      muted: "#1d2a40",
      mutedForeground: "#a8b3c7",
      border: "#33425a",
      input: "#52627a",
      primary: "color-mix(in srgb, var(--a-brand) 32%, white)",
      primaryForeground: "color-mix(in srgb, var(--a-brand) 24%, black)",
      primaryHover: "var(--a-brand-hover)",
      selectionStrong: "#17345c",
      selectionStrongForeground: "#b9d4ff",
      selectionSubtle: "#17345c",
      selectionSubtleForeground: "#b9d4ff",
      panelBackground: "var(--a-surface)",
      panelHeaderBackground: "var(--a-surface-raised)",
      panelToolbarBackground: "var(--a-muted)",
      danger: "#f97066",
      dangerForeground: "#230402",
      warning: "#fec84b",
      warningForeground: "#241400",
      success: "#47cd89",
      successForeground: "#031b12",
      focus: "#84caff",
      scrim: "rgb(0 0 0 / 0.72)",
      contrast: "#f4f6f8",
      contrastForeground: "#11151c",
      warningSubtle: "#2b2110",
      warningSubtleForeground: "#f5f7fa",
      dangerSubtle: "#2d1512",
      dangerSubtleForeground: "#f5f7fa",
      successSubtle: "#0c2418",
      successSubtleForeground: "#f5f7fa",
      brand: ATLAS_MODERN_BRAND.colors.primary,
      brandForeground: ATLAS_MODERN_BRAND.colors.primaryForeground,
      brandHover: "color-mix(in srgb, var(--a-brand) 42%, white)",
      brandSoft: "color-mix(in srgb, var(--a-brand) 52%, black)",
      storyStart: ATLAS_MODERN_BRAND.colors.storyStart,
      storyEnd: ATLAS_MODERN_BRAND.colors.storyEnd,
      storyForeground: ATLAS_MODERN_BRAND.colors.storyForeground,
      storyMuted: ATLAS_MODERN_BRAND.colors.storyMuted,
      storyEyebrow: ATLAS_MODERN_BRAND.colors.storyEyebrow,
      storyWave: ATLAS_MODERN_BRAND.colors.storyWave,
      storyWaveBright: ATLAS_MODERN_BRAND.colors.storyWaveBright,
      storyGlow: ATLAS_MODERN_BRAND.colors.storyGlow,
      storyDot: ATLAS_MODERN_BRAND.colors.storyDot,
      storyBorder:
        "color-mix(in srgb, var(--a-story-foreground) 14%, transparent)",
      storySurface:
        "color-mix(in srgb, var(--a-story-foreground) 6%, transparent)",
      storySurfaceHover:
        "color-mix(in srgb, var(--a-story-foreground) 10%, transparent)",
      storySurfaceActive:
        "color-mix(in srgb, var(--a-story-wave) 22%, transparent)",
      storySelectionBorder:
        "color-mix(in srgb, var(--a-story-wave-bright) 38%, transparent)",
      storyFocus: "#84caff",
      storyDanger: "#f97066",
      storyDangerForeground: "#230402",
      storyWarning: "#fec84b",
      storyWarningForeground: "#241400",
      storySuccess: "#47cd89",
      storySuccessForeground: "#031b12",
      storyContrast: "#f4f6f8",
      storyContrastForeground: "#11151c",
    }),
    "high-contrast": Object.freeze({
      background: "#000000",
      foreground: "#ffffff",
      surface: "#000000",
      surfaceRaised: "#0a0a0a",
      muted: "#171717",
      mutedForeground: "#ffffff",
      border: "#ffffff",
      input: "#ffffff",
      primary: "#ffff00",
      primaryForeground: "#000000",
      primaryHover: "#ffffff",
      selectionStrong: "#ffff00",
      selectionStrongForeground: "#000000",
      selectionSubtle: "#000000",
      selectionSubtleForeground: "#ffff00",
      panelBackground: "#000000",
      panelHeaderBackground: "#000000",
      panelToolbarBackground: "#171717",
      danger: "#ff6b6b",
      dangerForeground: "#000000",
      warning: "#ffff00",
      warningForeground: "#000000",
      success: "#66ff99",
      successForeground: "#000000",
      focus: "#00ffff",
      scrim: "rgb(0 0 0 / 0.88)",
      contrast: "#ffff00",
      contrastForeground: "#000000",
      warningSubtle: "#000000",
      warningSubtleForeground: "#ffffff",
      dangerSubtle: "#000000",
      dangerSubtleForeground: "#ffffff",
      successSubtle: "#000000",
      successSubtleForeground: "#ffffff",
      brand: "#ffff00",
      brandForeground: "#000000",
      brandHover: "#ffffff",
      brandSoft: "#000000",
      storyStart: "#000000",
      storyEnd: "#000000",
      storyForeground: "#ffffff",
      storyMuted: "#ffffff",
      storyEyebrow: "#ffff00",
      storyWave: "#ffff00",
      storyWaveBright: "#ffffff",
      storyGlow: "transparent",
      storyDot: "#ffffff",
      storyBorder: "#ffffff",
      storySurface: "#000000",
      storySurfaceHover: "#171717",
      storySurfaceActive: "#000000",
      storySelectionBorder: "#ffff00",
      storyFocus: "#00ffff",
      storyDanger: "#ff6b6b",
      storyDangerForeground: "#000000",
      storyWarning: "#ffff00",
      storyWarningForeground: "#000000",
      storySuccess: "#66ff99",
      storySuccessForeground: "#000000",
      storyContrast: "#ffff00",
      storyContrastForeground: "#000000",
    }),
  });

/**
 * Atlas Mono: greyscale surfaces/chrome. Danger/warning/success are
 * copied unchanged from COLOR_TOKENS so status meaning never depends on hue
 * alone — see foundation theme assessment in the design-system rollout notes.
 */
export const MONO_COLOR_TOKENS: Readonly<Record<ColorMode, ColorTokenSet>> =
  Object.freeze({
    light: Object.freeze({
      ...COLOR_TOKENS.light,
      background: "#fafafa",
      foreground: "#1a1a1a",
      surface: "#ffffff",
      surfaceRaised: "#ffffff",
      muted: "#f0f0f0",
      mutedForeground: "#595959",
      border: "#d9d9d9",
      input: "#a6a6a6",
      focus: "var(--a-selection-subtle-foreground)",
      brand: ATLAS_MONO_BRAND.colors.primary,
      brandForeground: ATLAS_MONO_BRAND.colors.primaryForeground,
      brandHover: ATLAS_MONO_BRAND.colors.primaryHover,
      brandSoft: ATLAS_MONO_BRAND.colors.primarySoft,
    }),
    dark: Object.freeze({
      ...COLOR_TOKENS.dark,
      background: "#121212",
      foreground: "#ededed",
      surface: "#1c1c1c",
      surfaceRaised: "#242424",
      muted: "#262626",
      mutedForeground: "#a6a6a6",
      border: "#3d3d3d",
      input: "#595959",
      focus: "var(--a-selection-subtle-foreground)",
      primary: "color-mix(in srgb, var(--a-brand) 32%, white)",
      primaryForeground: "color-mix(in srgb, var(--a-brand) 24%, black)",
      selectionStrong: "#333333",
      selectionStrongForeground: "#f0f0f0",
      selectionSubtle: "#333333",
      selectionSubtleForeground: "#f0f0f0",
      brand: "#e0e0e0",
      brandForeground: "#121212",
      brandHover: "color-mix(in srgb, var(--a-brand) 42%, white)",
      brandSoft: "#262626",
    }),
    /** High contrast is an accessibility mode, not a brand — identical across families. */
    "high-contrast": COLOR_TOKENS["high-contrast"],
  });

export const FAMILY_COLOR_TOKENS: Readonly<Record<ThemeFamily, Readonly<Record<ColorMode, ColorTokenSet>>>> =
  Object.freeze({
    "atlas-modern": COLOR_TOKENS,
    "atlas-mono": MONO_COLOR_TOKENS,
  });

export function resolveFamilyColorTokens(family: ThemeFamily, mode: ColorMode): ColorTokenSet {
  return FAMILY_COLOR_TOKENS[family][mode];
}

/** One chart colour set: `--a-chart-1` … `--a-chart-8` (five under high
 * contrast), `--a-chart-single`, `--a-chart-neutral` ("Others"),
 * `--a-chart-grid` and `--a-chart-axis`. The tones are the status tokens
 * (`--a-success`, `--a-warning`, `--a-danger`, and `--a-muted-foreground` for
 * neutral). Shared chart blueprint 13.4a.11; every set passes the colour
 * validator and is locked in chart-colors.test.ts (decision 26). */
export interface ChartColorTokenSet {
  readonly sequence: readonly string[];
  readonly single: string;
  readonly neutral: string;
  readonly grid: string;
  readonly axis: string;
}

/** High contrast is an accessibility mode, not a brand: one set, five colours. */
const HIGH_CONTRAST_CHART_COLORS: ChartColorTokenSet = Object.freeze({
  sequence: Object.freeze(["#4a78d0", "#faa825", "#f8c3ff", "#b1578d", "#05a7c2"]),
  single: "#ffff00",
  neutral: "#9a9a9a",
  grid: "#3a3a3a",
  axis: "#ffffff",
});

export const CHART_COLOR_TOKENS: Readonly<Record<ThemeFamily, Readonly<Record<ColorMode, ChartColorTokenSet>>>> =
  Object.freeze({
    "atlas-modern": Object.freeze({
      light: Object.freeze({
        sequence: Object.freeze(["#054e8d", "#c18304", "#2098f6", "#89385a", "#af71b6", "#6250d6", "#e93288", "#51a062"]),
        single: "#234b84",
        neutral: "#8e94a0",
        grid: "#e3e8ef",
        axis: "#8a94a6",
      }),
      dark: Object.freeze({
        sequence: Object.freeze(["#527ffa", "#b27d06", "#eb92af", "#1f7746", "#2ca08e", "#ac9fea", "#ce0c38", "#b825ae"]),
        single: "#b9c5d8",
        neutral: "#6b7486",
        grid: "#2a3850",
        axis: "#6b7a93",
      }),
      "high-contrast": HIGH_CONTRAST_CHART_COLORS,
    }),
    /** Chromatic but quiet (chroma at most 40): decision 16, owner's quieter level. */
    "atlas-mono": Object.freeze({
      light: Object.freeze({
        sequence: Object.freeze(["#4d4481", "#9a934a", "#4499d8", "#13524a", "#7f728b", "#b66d6d", "#8f4b68", "#5870b3"]),
        single: "#1a1a1a",
        neutral: "#949494",
        grid: "#e6e6e6",
        axis: "#8c8c8c",
      }),
      dark: Object.freeze({
        sequence: Object.freeze(["#95a3eb", "#857a33", "#e6c4e5", "#5da190", "#835a84", "#5079bc", "#586f4f", "#a48bb0"]),
        single: "#ededed",
        neutral: "#707070",
        grid: "#333333",
        axis: "#7a7a7a",
      }),
      "high-contrast": HIGH_CONTRAST_CHART_COLORS,
    }),
  });

export function resolveChartColorTokens(family: ThemeFamily, mode: ColorMode): ChartColorTokenSet {
  return CHART_COLOR_TOKENS[family][mode];
}

/** Density token values; styles.css defines the same values for [data-density]. */
export const DENSITY_TOKENS = Object.freeze({
  compact: Object.freeze({
    controlHeight: "2rem",
    touchTarget: "2.75rem",
    space: "0.25rem",
    pageGap: "1rem",
    rowHeight: "2rem",
    headerHeight: "2rem",
    cellPaddingInline: "0.5rem",
    cellPaddingBlock: "0.125rem",
    dataFontSize: "0.875rem",
    iconButton: "1.5rem",
    /** Small text controls: chips, drawer tabs, toolbar choices, disclosures. */
    controlHeightSmall: "1.75rem",
    stackGap: "0.5rem",
    sectionGap: "1rem",
    panelGutter: "0.75rem",
    /** Text roles for work content: values, labels and section headings scale with density; chrome does not. */
    dataLineHeight: "1.25rem",
    labelFontSize: "0.8125rem",
    labelLineHeight: "1.125rem",
    sectionFontSize: "0.9375rem",
    sectionLineHeight: "1.375rem",
  }),
  comfortable: Object.freeze({
    controlHeight: "2.5rem",
    touchTarget: "2.75rem",
    space: "0.5rem",
    pageGap: "1.5rem",
    rowHeight: "2.75rem",
    headerHeight: "2.5rem",
    cellPaddingInline: "0.75rem",
    cellPaddingBlock: "0.25rem",
    dataFontSize: "0.9375rem",
    iconButton: "2rem",
    /** Small text controls: chips, drawer tabs, toolbar choices, disclosures. */
    controlHeightSmall: "2rem",
    stackGap: "0.75rem",
    sectionGap: "1.5rem",
    panelGutter: "1rem",
    /** Text roles for work content: values, labels and section headings scale with density; chrome does not. */
    dataLineHeight: "1.375rem",
    labelFontSize: "0.875rem",
    labelLineHeight: "1.25rem",
    sectionFontSize: "1rem",
    sectionLineHeight: "1.5rem",
  }),
  spacious: Object.freeze({
    controlHeight: "3rem",
    touchTarget: "3rem",
    space: "0.75rem",
    pageGap: "2rem",
    rowHeight: "3.5rem",
    headerHeight: "3rem",
    cellPaddingInline: "1rem",
    cellPaddingBlock: "0.375rem",
    dataFontSize: "1rem",
    iconButton: "2.25rem",
    /** Small text controls: chips, drawer tabs, toolbar choices, disclosures. */
    controlHeightSmall: "2.25rem",
    stackGap: "1rem",
    sectionGap: "2rem",
    panelGutter: "1.25rem",
    /** Text roles for work content: values, labels and section headings scale with density; chrome does not. */
    dataLineHeight: "1.5rem",
    labelFontSize: "0.9375rem",
    labelLineHeight: "1.375rem",
    sectionFontSize: "1.0625rem",
    sectionLineHeight: "1.625rem",
  }),
});

export const FOUNDATION_TOKENS = Object.freeze({
  typography: Object.freeze({
    sans: "Geist, Inter, ui-sans-serif, system-ui, sans-serif",
    mono: "ui-monospace, SFMono-Regular, monospace",
    caption: "0.6875rem",
    xSmall: "0.75rem",
    small: "0.875rem",
    body: "0.9375rem",
    medium: "1.0625rem",
    large: "1.25rem",
    title: "1.5rem",
    display: "clamp(1.75rem, 1.3rem + 2.2vw, 2.5rem)",
    bodyLineHeight: "1.5",
    titleLineHeight: "1.25",
    normalWeight: 400,
    regularWeight: 500,
    mediumWeight: 600,
    strongWeight: 700,
  }),
  lineHeight: Object.freeze({
    none: "1",
    tight: "1.2",
    snug: "1.35",
    body: "1.5",
    relaxed: "1.7",
    title: "1.25",
  }),
  tracking: Object.freeze({
    tighter: "-0.035em",
    tight: "-0.01em",
    normal: "0",
    wide: "0.04em",
    wider: "0.09em",
  }),
  spacing: Object.freeze({
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
  }),
  radii: Object.freeze({
    small: "0.375rem",
    medium: "0.625rem",
    large: "0.875rem",
    extraLarge: "1rem",
    round: "9999px",
  }),
  elevation: Object.freeze({
    raised: "0 1px 3px rgb(15 23 42 / 0.12)",
    overlay: "0 18px 48px rgb(15 23 42 / 0.24)",
    prominent: "0 1.5rem 4rem rgb(15 23 42 / 0.14)",
    sm: "0 1px 2px rgb(15 23 42 / 0.08)",
    md: "0 4px 12px rgb(15 23 42 / 0.1)",
    card: "0 1px 3px rgb(15 23 42 / 0.1), 0 1px 2px rgb(15 23 42 / 0.06)",
  }),
  accessibility: Object.freeze({ focusWidth: "3px", focusOffset: "2px" }),
  zIndex: Object.freeze({
    base: 0,
    sticky: 20,
    overlay: 40,
    drawer: 50,
    popover: 60,
    dialog: 70,
    toast: 80,
  }),
  motion: Object.freeze({
    fast: "120ms",
    normal: "180ms",
    slow: "260ms",
    easing: "cubic-bezier(.2,.8,.2,1)",
  }),
  sizing: Object.freeze({
    contentSmall: "32rem",
    iconSmall: "1rem",
    iconMedium: "1.25rem",
    logoMedium: "1.75rem",
  }),
  borders: Object.freeze({ width: "1px" }),
  opacity: Object.freeze({ interactive: "0.88", disabled: "0.55" }),
});

export interface ThemeResolutionInput {
  readonly sessionProfile?: unknown;
  readonly tenantDefault?: unknown;
  readonly platformDefault?: unknown;
  readonly systemDark?: boolean;
  readonly systemHighContrast?: boolean;
}

export function isColorMode(value: unknown): value is ColorMode {
  return (
    typeof value === "string" &&
    (COLOR_MODES as readonly string[]).includes(value)
  );
}

export function resolveColorMode(input: ThemeResolutionInput): ColorMode {
  if (isColorMode(input.sessionProfile)) return input.sessionProfile;
  if (isColorMode(input.tenantDefault)) return input.tenantDefault;
  if (isColorMode(input.platformDefault)) return input.platformDefault;
  if (input.systemHighContrast) return "high-contrast";
  return input.systemDark ? "dark" : "light";
}
