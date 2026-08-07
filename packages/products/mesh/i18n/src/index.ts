/**
 * @athyper/app-mesh-i18n
 *
 * Mesh plane i18n extension point.
 * Common locale engine is in @athyper/i18n; add mesh-specific message
 * dictionaries under lang/{locale}/*.json as modules are localised.
 */

export { i18nConfig, isValidLocale, isRtlLocale, getLocaleDir } from "@athyper/platform-i18n/config";
export type { Locale } from "@athyper/platform-i18n/config";
