import IntlMessageFormat, { type FormatXMLElementFn, type PrimitiveType } from "intl-messageformat";

export type TextDirection = "ltr" | "rtl";
export const SUPPORTED_UI_LOCALES = Object.freeze(["en", "ar", "ms", "zh-Hans", "hi", "ta", "fr", "de"] as const);
export type SupportedLocale = (typeof SUPPORTED_UI_LOCALES)[number];
export type LocaleRolloutWave = 0 | 1 | 2 | 3;
export interface LocaleRegistryEntry {
  readonly code: SupportedLocale;
  readonly englishName: string;
  readonly nativeName: string;
  readonly direction: TextDirection;
  readonly rolloutWave: LocaleRolloutWave;
  readonly defaultFormatLocale: string;
}

export const LOCALE_REGISTRY: readonly LocaleRegistryEntry[] = Object.freeze([
  Object.freeze({ code: "en", englishName: "English", nativeName: "English", direction: "ltr", rolloutWave: 0, defaultFormatLocale: "en-US" }),
  Object.freeze({ code: "ar", englishName: "Arabic", nativeName: "العربية", direction: "rtl", rolloutWave: 1, defaultFormatLocale: "ar-SA" }),
  Object.freeze({ code: "ms", englishName: "Malay", nativeName: "Bahasa Melayu", direction: "ltr", rolloutWave: 1, defaultFormatLocale: "ms-MY" }),
  Object.freeze({ code: "zh-Hans", englishName: "Simplified Chinese", nativeName: "简体中文", direction: "ltr", rolloutWave: 1, defaultFormatLocale: "zh-Hans-CN" }),
  Object.freeze({ code: "hi", englishName: "Hindi", nativeName: "हिन्दी", direction: "ltr", rolloutWave: 2, defaultFormatLocale: "hi-IN" }),
  Object.freeze({ code: "ta", englishName: "Tamil", nativeName: "தமிழ்", direction: "ltr", rolloutWave: 2, defaultFormatLocale: "ta-IN" }),
  Object.freeze({ code: "fr", englishName: "French", nativeName: "Français", direction: "ltr", rolloutWave: 3, defaultFormatLocale: "fr-FR" }),
  Object.freeze({ code: "de", englishName: "German", nativeName: "Deutsch", direction: "ltr", rolloutWave: 3, defaultFormatLocale: "de-DE" }),
]);
const LOCALE_REGISTRY_BY_CODE = new Map<SupportedLocale, LocaleRegistryEntry>(LOCALE_REGISTRY.map((entry) => [entry.code, entry]));

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_UI_LOCALES as readonly string[]).includes(value);
}

export function localeDefinition(code: SupportedLocale): LocaleRegistryEntry {
  return LOCALE_REGISTRY_BY_CODE.get(code)!;
}
export type LocaleSource = "principal" | "tenant" | "request" | "platform";
export type MessageCatalog = Readonly<Record<string, string>>;
export type MessageValues = Readonly<Record<string, PrimitiveType | FormatXMLElementFn<string, string>>>;

export interface EffectiveLocalization {
  readonly uiLocale: string;
  readonly catalogLocale: string;
  readonly formatLocale: string;
  readonly direction: TextDirection;
  readonly timeZone: string;
  readonly calendar: string;
  readonly numberingSystem: string;
  readonly weekStart: number;
  readonly weekendDays: readonly number[];
  readonly fallbackLocales: readonly string[];
  readonly catalogRevision: string;
  readonly source: Readonly<{ uiLocale: LocaleSource; formatLocale: LocaleSource }>;
}

export interface LocalizationDiagnostic {
  readonly kind: "invalid-locale" | "unsupported-locale" | "missing-message" | "invalid-message";
  readonly locale: string;
  readonly messageId?: string;
  readonly fallbackLocale?: string;
}

export interface CreateLocalizationInput {
  readonly uiLocale?: string;
  readonly formatLocale?: string;
  readonly timeZone?: string;
  readonly calendar?: string;
  readonly numberingSystem?: string;
  readonly weekStart?: number;
  readonly weekendDays?: readonly number[];
  readonly supportedLocales?: readonly string[];
  readonly platformLocale?: string;
  readonly catalogRevision?: string;
  readonly source?: Partial<EffectiveLocalization["source"]>;
  readonly onDiagnostic?: (event: LocalizationDiagnostic) => void;
}

export const PLATFORM_LOCALE = "en-US";
export const PLATFORM_CATALOG_LOCALE = "en";
export function canonicalLocale(value: string | undefined, fallback = PLATFORM_LOCALE, onDiagnostic?: (event: LocalizationDiagnostic) => void): string {
  const candidate = value?.trim();
  if (candidate) {
    try { return Intl.getCanonicalLocales(candidate)[0] ?? fallback; }
    catch { onDiagnostic?.({ kind: "invalid-locale", locale: candidate, fallbackLocale: fallback }); }
  }
  return Intl.getCanonicalLocales(fallback)[0] ?? PLATFORM_LOCALE;
}

export function localeFallbackChain(locale: string, platformLocale = PLATFORM_CATALOG_LOCALE): readonly string[] {
  const canonical = canonicalLocale(locale, platformLocale);
  const parsed = new Intl.Locale(canonical);
  const values = [canonical];
  if (parsed.script) values.push(`${parsed.language}-${parsed.script}`);
  values.push(parsed.language, canonicalLocale(platformLocale, PLATFORM_CATALOG_LOCALE));
  return Object.freeze([...new Set(values)]);
}

export function matchSupportedLocale(requested: string | undefined, supported: readonly string[] = SUPPORTED_UI_LOCALES, platformLocale = PLATFORM_CATALOG_LOCALE, onDiagnostic?: (event: LocalizationDiagnostic) => void): string {
  const normalizedSupported = supported.map((locale) => canonicalLocale(locale, platformLocale));
  const requestedLocale = canonicalLocale(requested, platformLocale, onDiagnostic);
  const requestedCandidates = localeFallbackChain(requestedLocale, platformLocale).filter((candidate) => candidate.toLowerCase() !== canonicalLocale(platformLocale).toLowerCase() || new Intl.Locale(requestedLocale).language === new Intl.Locale(platformLocale).language);
  for (const candidate of requestedCandidates) {
    const exact = normalizedSupported.find((supportedLocale) => supportedLocale.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
  }
  const requestedMaximized = new Intl.Locale(requestedLocale).maximize();
  const scriptMatch = normalizedSupported.find((supportedLocale) => {
    const supportedMaximized = new Intl.Locale(supportedLocale).maximize();
    return supportedMaximized.language === requestedMaximized.language && supportedMaximized.script === requestedMaximized.script;
  });
  if (scriptMatch) return scriptMatch;
  const fallback = normalizedSupported.find((locale) => locale.toLowerCase() === canonicalLocale(platformLocale).toLowerCase()) ?? normalizedSupported[0] ?? PLATFORM_CATALOG_LOCALE;
  if (requested && requestedLocale.toLowerCase() !== fallback.toLowerCase()) onDiagnostic?.({ kind: "unsupported-locale", locale: requestedLocale, fallbackLocale: fallback });
  return fallback;
}

export function textDirection(locale: string): TextDirection {
  const parsed = new Intl.Locale(canonicalLocale(locale));
  const localeWithInfo = parsed as Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } };
  const direction = localeWithInfo.getTextInfo?.().direction ?? localeWithInfo.textInfo?.direction;
  if (direction === "rtl" || direction === "ltr") return direction;
  const maximized = parsed.maximize();
  return ["Arab", "Hebr", "Nkoo", "Rohg", "Syrc", "Thaa", "Adlm"].includes(maximized.script ?? "") ? "rtl" : "ltr";
}

export function parseAcceptLanguage(value: string | null | undefined): readonly string[] {
  if (!value) return Object.freeze([]);
  return Object.freeze(value.split(",").map((part) => {
    const [locale, ...parameters] = part.trim().split(";");
    const quality = parameters.map((item) => /^q=(0(?:\.\d+)?|1(?:\.0+)?)$/i.exec(item.trim())).find(Boolean)?.[1];
    return { locale: locale?.trim() ?? "", quality: quality === undefined ? 1 : Number(quality) };
  }).filter((item) => item.locale && item.locale !== "*" && item.quality > 0).sort((left, right) => right.quality - left.quality).map((item) => canonicalLocale(item.locale)));
}

export function resolveRequestLocale(input: { readonly cookieLocale?: string; readonly acceptLanguage?: string | null; readonly supportedLocales?: readonly string[]; readonly platformLocale?: string; readonly onDiagnostic?: (event: LocalizationDiagnostic) => void }): string {
  const platformLocale = input.platformLocale ?? PLATFORM_CATALOG_LOCALE;
  const supported = input.supportedLocales ?? SUPPORTED_UI_LOCALES;
  if (input.cookieLocale) return matchSupportedLocale(input.cookieLocale, supported, platformLocale, input.onDiagnostic);
  for (const locale of parseAcceptLanguage(input.acceptLanguage)) {
    const match = matchSupportedLocale(locale, supported, platformLocale);
    if (new Intl.Locale(locale).language.toLowerCase() === new Intl.Locale(match).language.toLowerCase()) return match;
  }
  return matchSupportedLocale(platformLocale, supported, platformLocale);
}

export function createEffectiveLocalization(input: CreateLocalizationInput = {}): EffectiveLocalization {
  const platformLocale = canonicalLocale(input.platformLocale, PLATFORM_LOCALE, input.onDiagnostic);
  const requestedUiLocale = canonicalLocale(input.uiLocale, platformLocale, input.onDiagnostic);
  const catalogLocale = matchSupportedLocale(requestedUiLocale, input.supportedLocales, PLATFORM_CATALOG_LOCALE, input.onDiagnostic);
  const formatLocale = canonicalLocale(input.formatLocale, requestedUiLocale, input.onDiagnostic);
  const locale = new Intl.Locale(formatLocale);
  const weekStart = validDay(input.weekStart) ? input.weekStart : 1;
  const weekendDays = input.weekendDays?.filter(validDay) ?? [0, 6];
  return Object.freeze({
    uiLocale: requestedUiLocale,
    catalogLocale,
    formatLocale,
    direction: textDirection(requestedUiLocale),
    timeZone: validTimeZone(input.timeZone) ? input.timeZone! : "UTC",
    calendar: validCalendar(input.calendar) ? input.calendar!.trim() : locale.calendar || "gregory",
    numberingSystem: validNumberingSystem(input.numberingSystem) ? input.numberingSystem!.trim() : locale.numberingSystem || "latn",
    weekStart,
    weekendDays: Object.freeze([...new Set(weekendDays)]),
    fallbackLocales: localeFallbackChain(requestedUiLocale, PLATFORM_CATALOG_LOCALE),
    catalogRevision: input.catalogRevision?.trim() || "catalog:development",
    source: Object.freeze({ uiLocale: input.source?.uiLocale ?? "platform", formatLocale: input.source?.formatLocale ?? "platform" }),
  });
}

export interface IntlRuntime {
  readonly localization: EffectiveLocalization;
  message(id: string, values?: MessageValues): string;
  number(value: number | bigint, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string;
  list(values: readonly string[], options?: Intl.ListFormatOptions): string;
  displayName(code: string, options: Intl.DisplayNamesOptions): string;
  collator(options?: Intl.CollatorOptions): Intl.Collator;
}

export function createIntlRuntime(input: { readonly localization: EffectiveLocalization; readonly messages: MessageCatalog; readonly fallbackMessages?: MessageCatalog; readonly onDiagnostic?: (event: LocalizationDiagnostic) => void }): IntlRuntime {
  const compiled = new Map<string, IntlMessageFormat>();
  const localization = input.localization;
  const formatter = (id: string): IntlMessageFormat => {
    const cached = compiled.get(id); if (cached) return cached;
    const translated = input.messages[id], fallback = input.fallbackMessages?.[id];
    const source = translated ?? fallback ?? id;
    if (translated === undefined) input.onDiagnostic?.({ kind: "missing-message", locale: localization.catalogLocale, messageId: id, ...(fallback ? { fallbackLocale: PLATFORM_CATALOG_LOCALE } : {}) });
    try { const result = new IntlMessageFormat(source, localization.uiLocale); compiled.set(id, result); return result; }
    catch (cause) { input.onDiagnostic?.({ kind: "invalid-message", locale: localization.catalogLocale, messageId: id }); if (fallback && fallback !== source) return new IntlMessageFormat(fallback, PLATFORM_CATALOG_LOCALE); throw cause; }
  };
  const runtime: IntlRuntime = {
    localization,
    message(id, values) { const result = formatter(id).format(values as Record<string, PrimitiveType | FormatXMLElementFn<string, string>> | undefined); return Array.isArray(result) ? result.join("") : String(result); },
    number(value, options) { return new Intl.NumberFormat(localization.formatLocale, { numberingSystem: localization.numberingSystem, ...options }).format(value); },
    date(value, options) { const date = value instanceof Date ? value : new Date(value); return new Intl.DateTimeFormat(localization.formatLocale, { timeZone: localization.timeZone, calendar: localization.calendar, numberingSystem: localization.numberingSystem, ...options }).format(date); },
    relativeTime(value, unit, options) { return new Intl.RelativeTimeFormat(localization.formatLocale, { numeric: "auto", ...options }).format(value, unit); },
    list(values, options) { return new Intl.ListFormat(localization.formatLocale, options).format(values); },
    displayName(code, options) { return new Intl.DisplayNames(localization.formatLocale, options).of(code) ?? code; },
    collator(options) { return new Intl.Collator(localization.formatLocale, options); },
  };
  return Object.freeze(runtime);
}

export function namespaceCatalog(namespace: string, catalog: MessageCatalog): MessageCatalog {
  if (!/^[a-z][a-z0-9.-]*$/.test(namespace)) throw new TypeError("Message namespace is invalid");
  return Object.freeze(Object.fromEntries(Object.entries(catalog).map(([key, value]) => [`${namespace}.${key}`, value])));
}

export function mergeCatalogs(...catalogs: readonly MessageCatalog[]): MessageCatalog {
  const output: Record<string, string> = {};
  for (const catalog of catalogs) for (const [id, message] of Object.entries(catalog)) {
    if (id in output && output[id] !== message) throw new TypeError(`Duplicate message id: ${id}`);
    if (!message.trim()) throw new TypeError(`Message ${id} must not be empty`);
    output[id] = message;
  }
  return Object.freeze(output);
}

function validDay(value: number | undefined): value is number { return Number.isInteger(value) && value! >= 0 && value! <= 6; }
function validTimeZone(value: string | undefined): boolean { if (!value?.trim()) return false; try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }
function validCalendar(value: string | undefined): boolean { if (!value?.trim()) return false; try { return new Intl.DateTimeFormat("en", { calendar: value }).resolvedOptions().calendar.toLowerCase() === value.toLowerCase(); } catch { return false; } }
function validNumberingSystem(value: string | undefined): boolean { if (!value?.trim()) return false; try { return new Intl.NumberFormat("en", { numberingSystem: value }).resolvedOptions().numberingSystem.toLowerCase() === value.toLowerCase(); } catch { return false; } }
