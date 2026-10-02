import type { IntlRuntime } from "./index";

/** The metadata shape shared by list and detail value renderers. */
export interface EntityValueField {
  readonly kind?: string;
  readonly valueKind?: string;
  readonly semanticRole?: string;
  readonly options?: readonly Readonly<{ readonly value: string; readonly label: string }>[];
  readonly filterOptions?: readonly Readonly<{
    readonly value: string | number | boolean;
    readonly label: string;
  }>[];
}

/**
 * Formats published entity values using the governed localization.  Both list
 * and detail surfaces use this so a value keeps the same meaning everywhere.
 */
export function formatEntityValue(
  value: unknown,
  field: EntityValueField | undefined,
  intl: IntlRuntime,
): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean")
    return intl.message(value ? "entity.value.yes" : "entity.value.no");
  if (typeof value === "number")
    return intl.number(value, { maximumFractionDigits: 20 });
  if (typeof value === "object") return JSON.stringify(value) ?? "—";
  if (typeof value !== "string") return String(value);

  const kind = field?.valueKind ?? field?.kind;
  if ((kind === "integer" || kind === "decimal" || kind === "money") && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    return formatExactDecimal(value, intl);
  if (kind === "date" || kind === "datetime") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()))
      return intl.date(
        date,
        kind === "date"
          ? { dateStyle: "medium", timeZone: "UTC" }
          : { dateStyle: "medium", timeStyle: "short" },
      );
  }
  if (field?.semanticRole === "country_code") {
    try {
      return intl.displayName(value.toUpperCase(), { type: "region" });
    } catch {
      return value;
    }
  }
  if (kind === "enum")
    return (
      (field?.filterOptions ?? field?.options)?.find((option) => option.value === value)?.label ??
      humanizeIdentifier(value)
    );
  return value;
}

const decimalFormats = new Map<string, { integer: Intl.NumberFormat; decimal: string; digits: readonly string[] }>();
function decimalFormat(intl: IntlRuntime) {
  const { formatLocale, numberingSystem } = intl.localization;
  const key = JSON.stringify([formatLocale, numberingSystem]);
  let cached = decimalFormats.get(key);
  if (!cached) {
    const integer = new Intl.NumberFormat(formatLocale, { numberingSystem, maximumFractionDigits: 0 });
    const decimal = new Intl.NumberFormat(formatLocale, { numberingSystem }).formatToParts(1.1).find(part => part.type === "decimal")?.value ?? ".";
    const digitFormat = new Intl.NumberFormat(formatLocale, { numberingSystem, useGrouping: false });
    cached = { integer, decimal, digits: Array.from({length: 10}, (_, digit) => digitFormat.format(digit)) };
    if (decimalFormats.size >= 32) decimalFormats.delete(decimalFormats.keys().next().value!);
    decimalFormats.set(key, cached);
  }
  return cached;
}

/** PostgreSQL numeric values are strings. Format their digits without a floating-point conversion. */
export function formatExactDecimal(value: string, intl: IntlRuntime): string {
  const negative = value.startsWith("-");
  const [whole, fraction] = (negative ? value.slice(1) : value).split(".");
  const { integer: formatter, decimal, digits } = decimalFormat(intl);
  // Number -0 preserves the locale's sign and bidi literals; BigInt -0 does not.
  const integer = formatter.format(negative && BigInt(whole!) === BigInt(0)
    ? -0 : BigInt(`${negative ? "-" : ""}${whole}`));
  if (fraction === undefined) return integer;
  return integer + decimal + [...fraction].map(digit => digits[Number(digit)]).join("");
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
