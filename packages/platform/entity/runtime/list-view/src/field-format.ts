import type {
  JsonValue,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import { humanizeIdentifier } from "@athyper/contract-platform-entity-runtime";
import type { IntlRuntime } from "@athyper/platform-i18n";
import { formatEntityValue } from "@athyper/platform-i18n/entity-value";

/** The list's offline fallback follows the same date-only and enum rules as the governed formatter. */
export function formatFieldValue(
  value: JsonValue | undefined,
  field?: ListFieldDescriptorV1,
  intl?: IntlRuntime,
): string {
  if (intl) return formatEntityValue(value, field, intl);
  if (value === undefined || value === null || value === "") return "—";
  // An unresolved reference never shows its raw identifier.
  if (field?.valueKind === "reference") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  if (field?.valueKind === "datetime" || field?.valueKind === "date") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime()))
      return new Intl.DateTimeFormat(
        "en",
        field.valueKind === "date"
          ? { dateStyle: "medium", timeZone: "UTC" }
          : { dateStyle: "medium", timeStyle: "short" },
      ).format(date);
  }
  if (
    field?.semanticRole === "country_code" &&
    typeof Intl.DisplayNames === "function"
  ) {
    try {
      return (
        new Intl.DisplayNames("en", { type: "region" }).of(
          String(value).toUpperCase(),
        ) ?? String(value)
      );
    } catch {
      return String(value);
    }
  }
  if (field?.valueKind === "enum")
    return (
      field.filterOptions?.find((option) => option.value === value)?.label ??
      humanizeIdentifier(String(value))
    );
  return String(value);
}
