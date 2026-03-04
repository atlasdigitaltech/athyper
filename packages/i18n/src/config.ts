/**
 * i18n configuration — supported locales and defaults.
 */

export const i18nConfig = {
    locales: ["en", "ms", "ta", "hi", "ar", "fr", "de"] as const,
    defaultLocale: "en" as const,

    /** RTL locales */
    rtlLocales: ["ar"] as const,
} as const;

export type Locale = (typeof i18nConfig)["locales"][number];

export function isValidLocale(value: string): value is Locale {
    return (i18nConfig.locales as readonly string[]).includes(value);
}

export function isRtlLocale(locale: Locale): boolean {
    return (i18nConfig.rtlLocales as readonly string[]).includes(locale);
}
