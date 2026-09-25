import type {
  EntityListDescriptorV1,
  JsonValue,
  ListFilterV1,
  ListFilterOperator,
} from "@athyper/contract-platform-entity-list";
export function filterValueFromInput(
  operator: ListFilterOperator,
  raw: string,
  valueKind?: EntityListDescriptorV1["fields"][number]["valueKind"],
  options?: EntityListDescriptorV1["fields"][number]["filterOptions"],
): JsonValue | undefined {
  if (operator === "is_null" || operator === "is_not_null") return undefined;
  if (operator === "relative") return raw.trim();
  const convert = (value: string): JsonValue => {
    if (!value) return "";
    const option = options?.find((item) => String(item.value) === value);
    if (option) return option.value;
    if (
      valueKind === "integer" ||
      valueKind === "decimal" ||
      valueKind === "money"
    )
      return Number(value);
    if (valueKind === "boolean") return value === "true";
    if (valueKind === "datetime") {
      const timestamp = new Date(value);
      return Number.isNaN(timestamp.valueOf())
        ? value
        : timestamp.toISOString();
    }
    return value;
  };
  if (operator === "in" || operator === "between")
    return Object.freeze(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map(convert),
    );
  return convert(raw.trim());
}

export function filterInputValue(
  filter: ListFilterV1,
  valueKind?: EntityListDescriptorV1["fields"][number]["valueKind"],
): string {
  if (filter.operator === "relative") return String(filter.value ?? "");
  const inputValue = (value: JsonValue | undefined): string => {
    if (value === undefined || value === null) return "";
    const text = String(value);
    if (valueKind === "date")
      return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
    if (valueKind !== "datetime") return text;
    const timestamp = new Date(text);
    if (Number.isNaN(timestamp.valueOf())) return text;
    const pad = (part: number, length = 2) =>
        String(part).padStart(length, "0"),
      seconds = timestamp.getSeconds(),
      milliseconds = timestamp.getMilliseconds();
    const date = `${pad(timestamp.getFullYear(), 4)}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}`,
      time = `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}`;
    return `${date}T${time}${seconds || milliseconds ? `:${pad(seconds)}${milliseconds ? `.${pad(milliseconds, 3)}` : ""}` : ""}`;
  };
  return Array.isArray(filter.value)
    ? filter.value.map(inputValue).join(", ")
    : inputValue(filter.value);
}
