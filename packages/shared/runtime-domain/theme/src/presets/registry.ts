/**
 * @athyper/theme — Preset Registry
 *
 * Metadata for all shipped theme presets.
 * CSS files live alongside this file in presets/*.css.
 *
 * Runtime switching:
 *   document.documentElement.dataset.themePreset = "mesh-night";
 *
 * Dark mode toggle:
 *   document.documentElement.classList.toggle("dark");
 */
import { THEME_CONTRACT_VERSION } from "../theme-contract";

export interface ThemePresetMeta {
  /** Unique key — matches [data-theme-preset] value */
  value: string;
  /** Human-readable label */
  label: string;
  /** Short aesthetic description */
  description: string;
  /** Border radius from --radius */
  radius: string;
  /** Visual category for UI grouping */
  category: "professional" | "expressive" | "playful" | "retro";
  /** Contract version this preset targets */
  contractVersion: number;
  /** Light-mode primary color for preview swatches (CSS color string) */
  primaryColor: string;
  /** Light-mode muted color for preview swatches (CSS color string) */
  mutedColor: string;
}

export const themePresets: readonly ThemePresetMeta[] = [
  {
    value: "neon-base",
    label: "neon base",
    description: "Shared baseline palette for Neon, Mesh, Admin, and IAM while plane themes are consolidated.",
    radius: "0.625rem",
    category: "professional",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.205 0 0)",
    mutedColor: "oklch(0.97 0 0)",
  },
  {
    value: "base",
    label: "base",
    description: "Clean neutral palette. Pure white background, black primary, warm chart accents.",
    radius: "0.625rem",
    category: "professional",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.205 0 0)",
    mutedColor: "oklch(0.97 0 0)",
  },
  {
    value: "neon-modern",
    label: "neon modern",
    description: "Clean, restrained, monochrome-accented. Ideal for enterprise dashboards.",
    radius: "0.5rem",
    category: "professional",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.45 0.18 250)",
    mutedColor: "oklch(0.965 0 0)",
  },
  {
    value: "neon-mono",
    label: "neon mono",
    description: "Pure greyscale with no chroma. Maximum typographic focus.",
    radius: "0.5rem",
    category: "professional",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.22 0 0)",
    mutedColor: "oklch(0.955 0 0)",
  },
  {
    value: "neon-tangerine",
    label: "neon tangerine",
    description: "Warm orange primary on cool slate. Approachable yet professional.",
    radius: "0.625rem",
    category: "professional",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.64 0.17 36.44)",
    mutedColor: "oklch(0.98 0 247.84)",
  },
  {
    value: "mesh-night",
    label: "mesh night",
    description: "Violet-purple palette with lavender tints. Polished light mode, deep dark mode.",
    radius: "0.5rem",
    category: "expressive",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.5417 0.1790 288.0332)",
    mutedColor: "oklch(0.9580 0.0133 286.1454)",
  },
  {
    value: "mesh-bloom",
    label: "mesh bloom",
    description: "Vivid violet primary with bright green and orange chart accents. Crisp and energetic.",
    radius: "0.625rem",
    category: "expressive",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.475 0.267 283)",
    mutedColor: "oklch(0.966 0 0)",
  },
  {
    value: "athyper-pop",
    label: "athyper pop",
    description: "Candy-colored palette with generous rounding.",
    radius: "1rem",
    category: "playful",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.5106 0.2301 276.9656)",
    mutedColor: "oklch(0.9551 0 0)",
  },
  {
    value: "athyper-bubble",
    label: "athyper bubble",
    description: "Hot pink primary with extra-round corners.",
    radius: "1.25rem",
    category: "playful",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.6 0.22 340)",
    mutedColor: "oklch(0.94 0.015 340)",
  },
  {
    value: "atlas-vintage",
    label: "atlas vintage",
    description: "Warm ochre and parchment tones. Earthy elegance for timeless interfaces.",
    radius: "0.625rem",
    category: "retro",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.583 0.067 54)",
    mutedColor: "oklch(0.912 0.016 82)",
  },
  {
    value: "atlas-neo",
    label: "atlas neo",
    description: "Zero radius, black borders, hard offset shadows. Raw and uncompromising.",
    radius: "0px",
    category: "retro",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.6489 0.237 26.9728)",
    mutedColor: "oklch(0.9551 0 0)",
  },
  {
    value: "atlas-doom",
    label: "atlas doom",
    description: "Red, green and blue primaries on deep greys. Tactical intensity with vivid contrast.",
    radius: "0.625rem",
    category: "retro",
    contractVersion: THEME_CONTRACT_VERSION,
    primaryColor: "oklch(0.5016 0.1887 27.4816)",
    mutedColor: "oklch(0.7826 0 0)",
  },
] as const;

export const DEFAULT_PRESET = "neon-base";

export function getPresetMeta(value: string): ThemePresetMeta | undefined {
  return themePresets.find((p) => p.value === value);
}

export function getPresetsByCategory(
  category: ThemePresetMeta["category"],
): ThemePresetMeta[] {
  return themePresets.filter((p) => p.category === category);
}
