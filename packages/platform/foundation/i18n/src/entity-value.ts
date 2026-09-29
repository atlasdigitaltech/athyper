import type { IntlRuntime } from "./index";

/** The metadata shape shared by list and detail value renderers. */
export interface EntityValueField {
  readonly kind?: string;
  readonly valueKind?: string;
  readonly semanticRole?: string;
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
      field?.filterOptions?.find((option) => option.value === value)?.label ??
      humanizeIdentifier(value)
    );
  return value;
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
