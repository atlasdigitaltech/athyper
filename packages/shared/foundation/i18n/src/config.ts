/**
 * @athyper/i18n — Locale Configuration
 *
 * Supported locales, RTL detection, and locale validation.
 * This is the single source of truth for which languages the platform supports.
 *
 * Usage:
 *   import { i18nConfig, isRtlLocale, isValidLocale } from "@athyper/i18n/config";
 */

export const i18nConfig = {
  /** All supported locale codes. English is the canonical source. */
  locales: ["en", "ar", "ms", "ta", "hi", "fr", "de"] as const,

  /** Default locale for unauthenticated and bootstrap pages. */
  defaultLocale: "en" as const,

  /** RTL (right-to-left) locales — affects layout direction in the shell. */
  rtlLocales: ["ar"] as const,
} as const;

export type Locale = (typeof i18nConfig)["locales"][number];

/** Check if a runtime string is a supported locale. */
export function isValidLocale(value: string): value is Locale {
  return (i18nConfig.locales as readonly string[]).includes(value);
}

/** Check if a locale requires RTL layout direction. */
export function isRtlLocale(locale: Locale): boolean {
  return (i18nConfig.rtlLocales as readonly string[]).includes(locale);
}

/** Get the HTML `dir` attribute value for a locale. */
export function getLocaleDir(locale: Locale): "ltr" | "rtl" {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}
