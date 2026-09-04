import { ATLAS_MODERN_BRAND } from "@athyper/platform-brand";

export const THEME_FAMILIES = [ATLAS_MODERN_BRAND.id] as const;
export type ThemeFamily = (typeof THEME_FAMILIES)[number];
export const DEFAULT_THEME_FAMILY: ThemeFamily = ATLAS_MODERN_BRAND.id;

export const COLOR_MODES = ["light", "dark", "high-contrast"] as const;
export const DENSITY_MODES = ["compact", "comfortable"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export type DensityMode = (typeof DENSITY_MODES)[number];
export type ThemePreference = ColorMode | "system";

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
      selectionStrong: "var(--a-primary)",
      selectionStrongForeground: "var(--a-primary-foreground)",
      selectionSubtle: "var(--a-brand-soft)",
      selectionSubtleForeground: "var(--a-primary)",
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
    }),
  });

export const DENSITY_TOKENS = Object.freeze({
  compact: Object.freeze({
    controlHeight: "2rem",
    touchTarget: "2.75rem",
    space: "0.25rem",
    pageGap: "1rem",
  }),
  comfortable: Object.freeze({
    controlHeight: "2.5rem",
    touchTarget: "2.75rem",
    space: "0.5rem",
    pageGap: "1.5rem",
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
