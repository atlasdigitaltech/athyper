import {
  parseEntityRuntimeLocalizedText,
  type EntityRuntimeLocalizedTextV1,
} from "@athyper/contract-platform-entity-runtime";

const SCHEMA = "athyper.meta-entity-localization/1";

/** Parses a sidecar owned by an Entity product, not framework source code. */
export function parseProductLocalization(value: unknown): {
  localize(reference: EntityRuntimeLocalizedTextV1): EntityRuntimeLocalizedTextV1;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("ENTITY_LOCALIZATION_OBJECT_REQUIRED");
  const source = value as Record<string, unknown>;
  if (
    source.schema !== SCHEMA ||
    typeof source.defaultLocale !== "string" ||
    !Array.isArray(source.requiredLocales) ||
    !source.requiredLocales.length ||
    !source.requiredLocales.every((locale) => typeof locale === "string") ||
    !source.values ||
    typeof source.values !== "object" ||
    Array.isArray(source.values)
  )
    throw new Error("ENTITY_LOCALIZATION_INVALID");
  const requiredLocales = new Set(source.requiredLocales.map(canonicalLocale));
  const defaultLocale = canonicalLocale(source.defaultLocale);
  if (!requiredLocales.has(defaultLocale))
    throw new Error("ENTITY_LOCALIZATION_DEFAULT_REQUIRED");
  const values = source.values as Record<string, unknown>;
  const localized = new Map<string, EntityRuntimeLocalizedTextV1>();
  for (const [labelKey, translations] of Object.entries(values)) {
    if (!translations || typeof translations !== "object" || Array.isArray(translations))
      throw new Error("ENTITY_LOCALIZATION_INVALID");
    const normalized: Record<string, string> = {};
    for (const [locale, text] of Object.entries(translations)) {
      const canonical = canonicalLocale(locale);
      if (!requiredLocales.has(canonical) || typeof text !== "string" || !text.trim())
        throw new Error("ENTITY_LOCALIZATION_INVALID");
      if (Object.hasOwn(normalized, canonical))
        throw new Error("ENTITY_LOCALIZATION_DUPLICATE_LOCALE");
      normalized[canonical] = text;
    }
    if (
      requiredLocales.size !== Object.keys(normalized).length ||
      [...requiredLocales].some((locale) => !Object.hasOwn(normalized, locale))
    )
      throw new Error("ENTITY_LOCALIZATION_TRANSLATION_REQUIRED");
    localized.set(
      labelKey,
      parseEntityRuntimeLocalizedText({
        labelKey,
        defaultText: normalized[defaultLocale],
        defaultLocale,
        values: normalized,
      }),
    );
  }
  return {
    localize(reference) {
      const translated = localized.get(reference.labelKey);
      if (!translated)
        throw new Error("ENTITY_LOCALIZATION_LABEL_REQUIRED");
      if (translated.defaultText !== reference.defaultText)
        throw new Error("ENTITY_LOCALIZATION_FALLBACK_MISMATCH");
      return translated;
    },
  };
}

function canonicalLocale(value: string): string {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? invalidLocale();
  } catch {
    return invalidLocale();
  }
}

function invalidLocale(): never {
  throw new Error("ENTITY_LOCALIZATION_INVALID_LOCALE");
}
