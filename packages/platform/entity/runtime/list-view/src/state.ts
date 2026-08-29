import type { EntityListDescriptorV1, JsonValue, ListFilterOperator, ListFilterV1, ListLocationStateV1, ListSortV1 } from "@athyper/contract-platform-entity-list";

export function withoutNavigation(state: ListLocationStateV1): ListLocationStateV1 {
  return Object.freeze({ ...state, cursor: undefined, pageIndex: 0 });
}

export function nextPrimarySort(current: readonly ListSortV1[], field: string): readonly ListSortV1[] {
  const active = current.find((item) => item.field === field);
  if (!active) return Object.freeze([{ field, direction: "asc" }]);
  if (active.direction === "asc") return Object.freeze([{ field, direction: "desc" }]);
  return Object.freeze([]);
}

export function visibleListFields(descriptor: EntityListDescriptorV1, state: ListLocationStateV1) {
  const order = new Map(state.columns.map((key, index) => [key, index]));
  return descriptor.fields.filter((field) => order.has(field.key)).sort((left, right) => (order.get(left.key) ?? 0) - (order.get(right.key) ?? 0));
}

export function filterValueFromInput(operator: ListFilterOperator, raw: string, valueKind?: EntityListDescriptorV1["fields"][number]["valueKind"]): JsonValue | undefined {
  if (operator === "is_null" || operator === "is_not_null") return undefined;
  const convert = (value: string): JsonValue => {
    if (!value) return "";
    if (valueKind === "integer" || valueKind === "decimal" || valueKind === "money") return Number(value);
    if (valueKind === "boolean") return value === "true";
    if (valueKind === "datetime") { const timestamp = new Date(value); return Number.isNaN(timestamp.valueOf()) ? value : timestamp.toISOString(); }
    return value;
  };
  if (operator === "in" || operator === "between") return Object.freeze(raw.split(",").map((item) => item.trim()).filter(Boolean).map(convert));
  return convert(raw.trim());
}

export function filterInputValue(filter: ListFilterV1, valueKind?: EntityListDescriptorV1["fields"][number]["valueKind"]): string {
  const inputValue = (value: JsonValue | undefined): string => {
    if (value === undefined || value === null) return "";
    const text = String(value);
    if (valueKind === "date") return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
    if (valueKind !== "datetime") return text;
    const timestamp = new Date(text);
    if (Number.isNaN(timestamp.valueOf())) return text;
    const pad = (part: number, length = 2) => String(part).padStart(length, "0"), seconds = timestamp.getSeconds(), milliseconds = timestamp.getMilliseconds();
    const date = `${pad(timestamp.getFullYear(), 4)}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}`, time = `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}`;
    return `${date}T${time}${seconds || milliseconds ? `:${pad(seconds)}${milliseconds ? `.${pad(milliseconds, 3)}` : ""}` : ""}`;
  };
  return Array.isArray(filter.value) ? filter.value.map(inputValue).join(", ") : inputValue(filter.value);
}

export function describeFilter(filter: ListFilterV1, descriptor: EntityListDescriptorV1): string {
  const field = descriptor.fields.find((candidate) => candidate.key === filter.field), label = field?.label ?? filter.field;
  const operator: Record<ListFilterOperator, string> = { eq: "is", ne: "is not", in: "is any of", contains: "contains", starts_with: "starts with", gt: "is greater than", gte: "is at least", lt: "is less than", lte: "is at most", between: "is between", is_null: "is empty", is_not_null: "is not empty", relative: "is" };
  const value = filterInputValue(filter, field?.valueKind);
  return `${label} ${operator[filter.operator]}${value ? ` ${value}` : ""}`;
}
