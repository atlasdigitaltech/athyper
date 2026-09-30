/** Browser-safe shared runtime values. Bootstrap resource parsing was removed:
 * no route or runtime consumed that provisional contract. */
import { isObjectRecord, isBoundedNonBlankText } from "./validation/values";

export interface EntityRuntimeLocalizedTextV1 {
  readonly labelKey: string;
  readonly defaultText: string;
  /** Published entity translations. Legacy key-only references remain readable. */
  readonly defaultLocale?: string;
  readonly values?: Readonly<Record<string, string>>;
}

const keyPattern = /^[a-z][a-z0-9_.-]{0,126}$/;

export function parseEntityRuntimeLocalizedText(
  value: unknown,
): EntityRuntimeLocalizedTextV1 {
  if (!isObjectRecord(value))
    throw new TypeError("localized text must be an object");
  if (
    Object.keys(value).some(
      (key) =>
        !["labelKey", "defaultText", "defaultLocale", "values"].includes(key),
    ) ||
    typeof value.labelKey !== "string" ||
    !keyPattern.test(value.labelKey) ||
    !isBoundedNonBlankText(value.defaultText, 500)
  )
    throw new TypeError("localized text is invalid");
  const base = {
    labelKey: value.labelKey,
    defaultText: value.defaultText,
  };
  if (value.defaultLocale === undefined && value.values === undefined)
    return Object.freeze(base);
  if (typeof value.defaultLocale !== "string" || !isObjectRecord(value.values))
    throw new TypeError("localized text translations are invalid");
  const defaultLocale = canonicalLocale(value.defaultLocale);
  const values: Record<string, string> = {};
  for (const [locale, text] of Object.entries(value.values)) {
    const canonical = canonicalLocale(locale);
    if (Object.hasOwn(values, canonical) || !isBoundedNonBlankText(text, 500))
      throw new TypeError("localized text translations are invalid");
    values[canonical] = text;
  }
  if (
    !Object.hasOwn(values, defaultLocale) ||
    values[defaultLocale] !== value.defaultText
  )
    throw new TypeError("localized text default translation is required");
  return Object.freeze({
    ...base,
    defaultLocale,
    values: Object.freeze(values),
  });
}

function canonicalLocale(value: string): string {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? invalidLocale();
  } catch {
    return invalidLocale();
  }
}

function invalidLocale(): never {
  throw new TypeError("localized text locale is invalid");
}
