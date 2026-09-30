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

export {filterValueFromInput, filterInputValue} from "@athyper/platform-collection-controls";
import {filterInputValue} from "@athyper/platform-collection-controls";

export function describeFilter(filter: ListFilterV1, descriptor: EntityListDescriptorV1): string {
  const field = descriptor.fields.find((candidate) => candidate.key === filter.field), label = field?.label ?? filter.field;
  const operator: Record<ListFilterOperator, string> = { eq: "is", ne: "is not", in: "is any of", contains: "contains", starts_with: "starts with", gt: "is greater than", gte: "is at least", lt: "is less than", lte: "is at most", between: "is between", is_null: "is empty", is_not_null: "is not empty", relative: "is" };
  const raw = filterInputValue(filter, field?.valueKind);
  const value = filter.operator === "relative" ? raw.replaceAll("_", " ") : (Array.isArray(filter.value) ? filter.value : [filter.value]).map(item => field?.filterOptions?.find(option => option.value === item)?.label ?? (field?.valueKind === "boolean" && typeof item === "boolean" ? item ? "Yes" : "No" : filterInputValue({ ...filter, value: item }, field?.valueKind))).join(filter.operator === "between" ? " – " : ", ");
  return `${label} ${operator[filter.operator]}${value ? ` ${value}` : ""}`;
}
