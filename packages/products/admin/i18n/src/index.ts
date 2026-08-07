/**
 * @athyper/app-admin-i18n
 *
 * Admin plane i18n extension point.
 * Common locale engine is in @athyper/i18n; add admin-specific message
 * dictionaries under lang/{locale}/*.json as modules are localised.
 */

export { i18nConfig, isValidLocale, isRtlLocale, getLocaleDir } from "@athyper/platform-i18n/config";
export type { Locale } from "@athyper/platform-i18n/config";
