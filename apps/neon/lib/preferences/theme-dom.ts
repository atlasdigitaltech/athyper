"use client";

import { getLocaleDir, isValidLocale, type Locale } from "@athyper/i18n/config";
import { DEFAULT_PRESET, getPresetMeta, type ThemePresetMeta } from "@athyper/theme/presets";

export const THEME_PRESET_COOKIE = "theme_preset";
const THEME_PRESET_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type AppearanceMode = "light" | "dark" | "system";
export type DensityCode = "compact" | "comfortable" | "spacious";
export type ThemePresetValue = ThemePresetMeta["value"];
export type LanguageCode = Locale;

export interface ThemePreferenceInput {
  appearanceMode?: unknown;
  appearance_mode?: unknown;
  densityCode?: unknown;
  density_code?: unknown;
  themePreset?: unknown;
  theme_preset?: unknown;
  languageCode?: unknown;
  language_code?: unknown;
  metadata?: unknown;
}

export interface AppliedThemePreferences {
  appearanceMode?: AppearanceMode;
  densityCode?: DensityCode;
  themePreset?: ThemePresetValue;
  languageCode?: LanguageCode;
}

const APPEARANCE_MODES = new Set<AppearanceMode>(["light", "dark", "system"]);
const DENSITY_CODES = new Set<DensityCode>(["compact", "comfortable", "spacious"]);

let stopSystemAppearanceListener: (() => void) | null = null;

export function applyThemePreferences(profile: ThemePreferenceInput): AppliedThemePreferences {
  const applied: AppliedThemePreferences = {};

  const appearanceMode =
    normalizeAppearanceMode(profile.appearanceMode) ??
    normalizeAppearanceMode(profile.appearance_mode);
  if (appearanceMode) {
    applied.appearanceMode = appearanceMode;
    syncAppearancePreferenceToDom(appearanceMode);
  }

  const densityCode =
    normalizeDensityCode(profile.densityCode) ??
    normalizeDensityCode(profile.density_code);
  if (densityCode) {
    applied.densityCode = densityCode;
    syncDensityToDom(densityCode);
  }

  const themePreset = extractThemePreset(profile);
  if (themePreset) {
    applied.themePreset = themePreset;
    syncPresetToDom(themePreset);
  }

  const languageCode =
    normalizeLanguageCode(profile.languageCode) ??
    normalizeLanguageCode(profile.language_code);
  if (languageCode) {
    applied.languageCode = languageCode;
    syncLocaleToDom(languageCode);
  }

  return applied;
}

export function normalizeAppearanceMode(value: unknown): AppearanceMode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase() as AppearanceMode;
  return APPEARANCE_MODES.has(normalized) ? normalized : undefined;
}

export function normalizeDensityCode(value: unknown): DensityCode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase() as DensityCode;
  return DENSITY_CODES.has(normalized) ? normalized : undefined;
}

export function normalizeThemePreset(value: unknown): ThemePresetValue | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim() || DEFAULT_PRESET;
  return getPresetMeta(normalized)?.value as ThemePresetValue | undefined;
}

export function normalizeLanguageCode(value: unknown): LanguageCode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return isValidLocale(normalized) ? normalized : undefined;
}

export function readPreferenceMetadata(profile: ThemePreferenceInput): Record<string, unknown> {
  if (isRecord(profile.metadata)) return profile.metadata;

  if (typeof profile.metadata === "string" && profile.metadata.trim()) {
    try {
      const parsed = JSON.parse(profile.metadata) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function extractThemePreset(profile: ThemePreferenceInput): ThemePresetValue | undefined {
  const metadata = readPreferenceMetadata(profile);
  return (
    normalizeThemePreset(profile.themePreset) ??
    normalizeThemePreset(profile.theme_preset) ??
    normalizeThemePreset(metadata["theme_preset"])
  );
}

function syncAppearancePreferenceToDom(mode: AppearanceMode) {
  if (typeof window === "undefined") return;

  stopSystemAppearanceListener?.();
  stopSystemAppearanceListener = null;

  if (mode !== "system") {
    syncAppearanceToDom(mode);
    return;
  }

  if (typeof window.matchMedia !== "function") {
    syncAppearanceToDom("light");
    return;
  }

  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const syncSystemMode = (matches: boolean) => syncAppearanceToDom(matches ? "dark" : "light");
  const onChange = (event: MediaQueryListEvent) => syncSystemMode(event.matches);

  syncSystemMode(query.matches);
  query.addEventListener("change", onChange);
  stopSystemAppearanceListener = () => query.removeEventListener("change", onChange);
}

function syncPresetToDom(preset: ThemePresetValue) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.themePreset = preset;
  document.cookie = `${THEME_PRESET_COOKIE}=${encodeURIComponent(preset)}; Max-Age=${THEME_PRESET_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

function syncAppearanceToDom(mode: Exclude<AppearanceMode, "system">) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function syncDensityToDom(density: DensityCode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = density;
}

function syncLocaleToDom(locale: LanguageCode) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = getLocaleDir(locale);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
