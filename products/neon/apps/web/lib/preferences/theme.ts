export const THEME_MODE_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
] as const;

export const THEME_MODE_VALUES = THEME_MODE_OPTIONS.map((o) => o.value);
export type ThemeMode = (typeof THEME_MODE_VALUES)[number];
export type ResolvedThemeMode = "light" | "dark";

// --- generated:themePresets:start ---

export const THEME_PRESET_OPTIONS = [
  {
    label: "Default",
    value: "default",
    font: "geist",
    primary: {
      light: "oklch(0.488 0.243 264.376)",
      dark: "oklch(0.488 0.243 264.376)",
    },
    swatch: {
      light: ["oklch(0.205 0 0)", "oklch(0.646 0.222 41.116)", "oklch(0.6 0.118 184.704)", "oklch(0.828 0.189 84.429)"],
      dark: ["oklch(0.922 0 0)", "oklch(0.488 0.243 264.376)", "oklch(0.532 0.157 257.08)", "oklch(0.905 0.182 98.111)"],
    },
  },
  {
    label: "Mono",
    value: "mono",
    font: "inter",
    primary: {
      light: "oklch(0.22 0 0)",
      dark: "oklch(0.88 0 0)",
    },
    swatch: {
      light: ["oklch(0.22 0 0)", "oklch(0.6 0 0)", "oklch(0.88 0 0)", "oklch(0.985 0 0)"],
      dark: ["oklch(0.88 0 0)", "oklch(0.56 0 0)", "oklch(0.32 0 0)", "oklch(0.12 0 0)"],
    },
  },
  {
    label: "Cosmic Night",
    value: "cosmic-night",
    font: "outfit",
    primary: {
      light: "oklch(0.45 0.2 275)",
      dark: "oklch(0.65 0.2 280)",
    },
    swatch: {
      light: ["oklch(0.45 0.2 275)", "oklch(0.55 0.15 230)", "oklch(0.7 0.12 200)", "oklch(0.65 0.18 310)"],
      dark: ["oklch(0.65 0.2 280)", "oklch(0.5 0.15 240)", "oklch(0.6 0.14 200)", "oklch(0.6 0.18 310)"],
    },
  },
  {
    label: "Soft Pop",
    value: "soft-pop",
    font: "nunito",
    primary: {
      light: "oklch(0.5106 0.2301 276.9656)",
      dark: "oklch(0.6801 0.1583 276.9349)",
    },
    swatch: {
      light: ["oklch(0.5106 0.2301 276.9656)", "oklch(0.7038 0.123 182.5025)", "oklch(0.7686 0.1647 70.0804)", "oklch(0.6559 0.2118 354.3084)"],
      dark: ["oklch(0.6801 0.1583 276.9349)", "oklch(0.7845 0.1325 181.912)", "oklch(0.879 0.1534 91.6054)", "oklch(0.7253 0.1752 349.7607)"],
    },
  },
  {
    label: "Brutalist",
    value: "brutalist",
    font: "roboto",
    primary: {
      light: "oklch(0.6489 0.237 26.9728)",
      dark: "oklch(0.7044 0.1872 23.1858)",
    },
    swatch: {
      light: ["oklch(0.6489 0.237 26.9728)", "oklch(0.968 0.211 109.7692)", "oklch(0.5635 0.2408 260.8178)", "oklch(0 0 0)"],
      dark: ["oklch(0.7044 0.1872 23.1858)", "oklch(0.9691 0.2005 109.6228)", "oklch(0.6755 0.1765 252.2592)", "oklch(1 0 0)"],
    },
  },
  {
    label: "Tangerine",
    value: "tangerine",
    font: "jakarta",
    primary: {
      light: "oklch(0.64 0.17 36.44)",
      dark: "oklch(0.64 0.17 36.44)",
    },
    swatch: {
      light: ["oklch(0.64 0.17 36.44)", "oklch(0.79 0.09 35.96)", "oklch(0.58 0.08 254.16)", "oklch(0.42 0.1 264.03)"],
      dark: ["oklch(0.64 0.17 36.44)", "oklch(0.77 0.09 34.19)", "oklch(0.58 0.08 254.16)", "oklch(0.42 0.1 264.03)"],
    },
  },
  {
    label: "Vintage Paper",
    value: "vintage-paper",
    font: "gabriela",
    primary: {
      light: "oklch(0.59 0.09 63)",
      dark: "oklch(0.72 0.06 65)",
    },
    swatch: {
      light: ["oklch(0.59 0.09 63)", "oklch(0.45 0.07 58)", "oklch(0.50 0.16 28)", "oklch(0.96 0.015 90)"],
      dark: ["oklch(0.72 0.06 65)", "oklch(0.59 0.09 63)", "oklch(0.50 0.16 28)", "oklch(0.22 0.015 48)"],
    },
  },
  {
    label: "Modern Minimal",
    value: "modern-minimal",
    font: "dmSans",
    primary: {
      light: "oklch(0.45 0.18 250)",
      dark: "oklch(0.6 0.17 250)",
    },
    swatch: {
      light: ["oklch(0.45 0.18 250)", "oklch(0.55 0.14 250)", "oklch(0.75 0.06 250)", "oklch(0.995 0 0)"],
      dark: ["oklch(0.6 0.17 250)", "oklch(0.52 0.13 250)", "oklch(0.42 0.08 250)", "oklch(0.11 0 0)"],
    },
  },
  {
    label: "Bubblegum",
    value: "bubblegum",
    font: "poppins",
    primary: {
      light: "oklch(0.6 0.22 340)",
      dark: "oklch(0.7 0.2 340)",
    },
    swatch: {
      light: ["oklch(0.6 0.22 340)", "oklch(0.75 0.14 310)", "oklch(0.82 0.12 85)", "oklch(0.65 0.18 280)"],
      dark: ["oklch(0.7 0.2 340)", "oklch(0.55 0.14 310)", "oklch(0.72 0.1 85)", "oklch(0.6 0.16 280)"],
    },
  },
  {
    label: "Violet Bloom",
    value: "violet-bloom",
    font: "manrope",
    primary: {
      light: "oklch(0.5 0.22 300)",
      dark: "oklch(0.68 0.18 300)",
    },
    swatch: {
      light: ["oklch(0.5 0.22 300)", "oklch(0.7 0.12 330)", "oklch(0.75 0.1 270)", "oklch(0.6 0.16 350)"],
      dark: ["oklch(0.68 0.18 300)", "oklch(0.58 0.12 330)", "oklch(0.6 0.1 270)", "oklch(0.6 0.14 350)"],
    },
  },
  {
    label: "Doom 64",
    value: "doom-64",
    font: "geistMono",
    primary: {
      light: "oklch(0.55 0.2 145)",
      dark: "oklch(0.6 0.22 145)",
    },
    swatch: {
      light: ["oklch(0.55 0.2 145)", "oklch(0.5 0.18 25)", "oklch(0.75 0.15 80)", "oklch(0.45 0.15 260)"],
      dark: ["oklch(0.6 0.22 145)", "oklch(0.55 0.2 25)", "oklch(0.7 0.16 80)", "oklch(0.5 0.15 260)"],
    },
  },
] as const;

export const THEME_PRESET_VALUES = THEME_PRESET_OPTIONS.map((p) => p.value);

export type ThemePreset = (typeof THEME_PRESET_OPTIONS)[number]["value"];

// --- generated:themePresets:end ---
