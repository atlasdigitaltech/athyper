export const COLOR_MODES = ["light", "dark", "high-contrast"] as const;
export const DENSITY_MODES = ["compact", "comfortable"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export type DensityMode = (typeof DENSITY_MODES)[number];
export type ThemePreference = ColorMode | "system";

export const REQUIRED_COLOR_TOKENS = [
  "background", "foreground", "surface", "surfaceRaised", "muted", "mutedForeground",
  "border", "input", "primary", "primaryForeground", "danger", "dangerForeground",
  "warning", "warningForeground", "success", "successForeground", "focus", "scrim",
  "contrast", "contrastForeground", "warningSubtle", "warningSubtleForeground",
] as const;

export type ColorToken = (typeof REQUIRED_COLOR_TOKENS)[number];
export type ColorTokenSet = Readonly<Record<ColorToken, string>>;

export const COLOR_TOKENS: Readonly<Record<ColorMode, ColorTokenSet>> = Object.freeze({
  light: Object.freeze({
    background: "#f8fafc", foreground: "#172033", surface: "#ffffff", surfaceRaised: "#ffffff",
    muted: "#eef2f7", mutedForeground: "#5b6578", border: "#d5dce7", input: "#aab4c5",
    primary: "#175cd3", primaryForeground: "#ffffff", danger: "#b42318", dangerForeground: "#ffffff",
    warning: "#b54708", warningForeground: "#ffffff", success: "#067647", successForeground: "#ffffff",
    focus: "#2e90fa", scrim: "rgb(15 23 42 / 0.58)", contrast: "#151515", contrastForeground: "#ffffff",
    warningSubtle: "#fff8eb", warningSubtleForeground: "#172033",
  }),
  dark: Object.freeze({
    background: "#0b1220", foreground: "#e8edf5", surface: "#111b2e", surfaceRaised: "#17243a",
    muted: "#1d2a40", mutedForeground: "#a8b3c7", border: "#33425a", input: "#52627a",
    primary: "#84adff", primaryForeground: "#071225", danger: "#f97066", dangerForeground: "#230402",
    warning: "#fec84b", warningForeground: "#241400", success: "#47cd89", successForeground: "#031b12",
    focus: "#84caff", scrim: "rgb(0 0 0 / 0.72)", contrast: "#f4f6f8", contrastForeground: "#11151c",
    warningSubtle: "#2b2110", warningSubtleForeground: "#f5f7fa",
  }),
  "high-contrast": Object.freeze({
    background: "#000000", foreground: "#ffffff", surface: "#000000", surfaceRaised: "#0a0a0a",
    muted: "#171717", mutedForeground: "#ffffff", border: "#ffffff", input: "#ffffff",
    primary: "#ffff00", primaryForeground: "#000000", danger: "#ff6b6b", dangerForeground: "#000000",
    warning: "#ffff00", warningForeground: "#000000", success: "#66ff99", successForeground: "#000000",
    focus: "#00ffff", scrim: "rgb(0 0 0 / 0.88)", contrast: "#ffff00", contrastForeground: "#000000",
    warningSubtle: "#000000", warningSubtleForeground: "#ffffff",
  }),
});

export const DENSITY_TOKENS = Object.freeze({
  compact: Object.freeze({ controlHeight: "2rem", touchTarget: "2.75rem", space: "0.25rem", pageGap: "1rem" }),
  comfortable: Object.freeze({ controlHeight: "2.5rem", touchTarget: "2.75rem", space: "0.5rem", pageGap: "1.5rem" }),
});

export const FOUNDATION_TOKENS = Object.freeze({
  typography: Object.freeze({ sans: "Geist, Inter, ui-sans-serif, system-ui, sans-serif", mono: "ui-monospace, SFMono-Regular, monospace", body: "0.9375rem", small: "0.875rem", title: "1.5rem", bodyLineHeight: "1.5", titleLineHeight: "1.25", regularWeight: 500, strongWeight: 700 }),
  spacing: Object.freeze({ 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 8: "2rem", 10: "2.5rem" }),
  radii: Object.freeze({ small: "0.375rem", medium: "0.625rem", large: "0.875rem", extraLarge: "1rem", round: "9999px" }),
  elevation: Object.freeze({ raised: "0 1px 3px rgb(15 23 42 / 0.12)", overlay: "0 18px 48px rgb(15 23 42 / 0.24)", prominent: "0 1.5rem 4rem rgb(15 23 42 / 0.14)" }),
  accessibility: Object.freeze({ focusWidth: "3px", focusOffset: "2px" }),
  zIndex: Object.freeze({ base: 0, sticky: 20, overlay: 40, drawer: 50, popover: 60, dialog: 70, toast: 80 }),
  motion: Object.freeze({ fast: "120ms", normal: "180ms", slow: "260ms", easing: "cubic-bezier(.2,.8,.2,1)" }),
  sizing: Object.freeze({ contentSmall: "32rem", iconSmall: "1rem", iconMedium: "1.25rem", logoMedium: "1.75rem" }),
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
  return typeof value === "string" && (COLOR_MODES as readonly string[]).includes(value);
}

export function resolveColorMode(input: ThemeResolutionInput): ColorMode {
  if (isColorMode(input.sessionProfile)) return input.sessionProfile;
  if (isColorMode(input.tenantDefault)) return input.tenantDefault;
  if (isColorMode(input.platformDefault)) return input.platformDefault;
  if (input.systemHighContrast) return "high-contrast";
  return input.systemDark ? "dark" : "light";
}
