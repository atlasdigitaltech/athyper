/**
 * @athyper/app-neon-i18n
 *
 * Neon plane i18n extension point.
 * Common locale engine is in @athyper/i18n; add neon-specific message
 * dictionaries under lang/{locale}/*.json as modules are localised.
 *
 * Usage:
 *   import { i18nConfig, getIntl } from "@athyper/i18n";
 *   import neonMessages from "@athyper/app-neon-i18n/lang/en/workbench.json";
 */

export { i18nConfig, isValidLocale, isRtlLocale, getLocaleDir } from "@athyper/i18n/config";
export type { Locale } from "@athyper/i18n/config";
