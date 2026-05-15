import { isValidLocale, type Locale } from "@athyper/i18n/config";
import { DEFAULT_PRESET, getPresetMeta, type ThemePresetMeta } from "@athyper/theme/presets";

export const THEME_PRESET_COOKIE = "theme_preset";
export const THEME_PRESET_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type AppearanceModeValue = "light" | "dark" | "system";
export type DensityCodeValue = "compact" | "comfortable" | "spacious";
export type ThemePresetValue = ThemePresetMeta["value"];
export type LanguageCodeValue = Locale;

export interface PreferenceBootstrapProfile {
  appearanceMode?: AppearanceModeValue;
  densityCode?: DensityCodeValue;
  themePreset?: ThemePresetValue;
  languageCode?: LanguageCodeValue;
}

const APPEARANCE_MODES = new Set<AppearanceModeValue>(["light", "dark", "system"]);
const DENSITY_CODES = new Set<DensityCodeValue>(["compact", "comfortable", "spacious"]);

export function normalizeAppearanceMode(value: unknown): AppearanceModeValue | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase() as AppearanceModeValue;
  return APPEARANCE_MODES.has(normalized) ? normalized : undefined;
}

export function normalizeDensityCode(value: unknown): DensityCodeValue | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase() as DensityCodeValue;
  return DENSITY_CODES.has(normalized) ? normalized : undefined;
}

export function normalizeThemePreset(value: unknown): ThemePresetValue | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim() || DEFAULT_PRESET;
  return getPresetMeta(normalized)?.value as ThemePresetValue | undefined;
}

export function normalizeLanguageCode(value: unknown): LanguageCodeValue | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return isValidLocale(normalized) ? (normalized as LanguageCodeValue) : undefined;
}

export function readPreferenceMetadata(profile: Record<string, unknown>): Record<string, unknown> {
  const metadata = profile["metadata"];

  if (isRecord(metadata)) return metadata;

  if (typeof metadata === "string" && metadata.trim()) {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function extractThemePresetFromPreferences(
  profile: Record<string, unknown>,
): ThemePresetValue | undefined {
  const metadata = readPreferenceMetadata(profile);
  return (
    normalizeThemePreset(profile["themePreset"]) ??
    normalizeThemePreset(profile["theme_preset"]) ??
    normalizeThemePreset(metadata["theme_preset"])
  );
}

export function normalizePreferencesForBootstrap(
  profile: Record<string, unknown>,
): PreferenceBootstrapProfile {
  return {
    appearanceMode:
      normalizeAppearanceMode(profile["appearanceMode"]) ??
      normalizeAppearanceMode(profile["appearance_mode"]),
    densityCode:
      normalizeDensityCode(profile["densityCode"]) ??
      normalizeDensityCode(profile["density_code"]),
    themePreset: extractThemePresetFromPreferences(profile),
    languageCode:
      normalizeLanguageCode(profile["languageCode"]) ??
      normalizeLanguageCode(profile["language_code"]),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
