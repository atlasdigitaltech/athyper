/**
 * @athyper/i18n
 *
 * Internationalization for the Athyper platform.
 * Supports: English (en), Arabic (ar), Malay (ms), Tamil (ta), Hindi (hi),
 *           French (fr), German (de).
 *
 * Prefer subpath imports:
 *   import { i18nConfig, isRtlLocale } from "@athyper/i18n/config";
 *   import { getIntl, loadModuleMessages } from "@athyper/i18n/intl";
 *   import enCommon from "@athyper/i18n/lang/en/common.json";
 *
 * Or from barrel:
 *   import { i18nConfig, getIntl } from "@athyper/i18n";
 */

export { i18nConfig, isValidLocale, isRtlLocale, getLocaleDir } from "./config.ts";
export type { Locale } from "./config.ts";

export { getIntl, loadModuleMessages, clearIntlCache } from "./get-intl.ts";

export type { Messages, MessageNamespace } from "./types.ts";

export { COMMON_NAMESPACE, MODULE_NAMESPACES, ALL_NAMESPACES } from "./namespaces.ts";
export type { ModuleNamespace, Namespace } from "./namespaces.ts";
