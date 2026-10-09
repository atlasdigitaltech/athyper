import type { RecordFilter } from "@athyper/server-contract-records";
import { ENTITY_LIST_RELATIVE_DATE_VALUES, MAX_LIST_FILTER_VALUES, temporalFilterValueError } from "@athyper/contract-platform-entity-list";
import { RecordServiceError } from "./errors.js";

const relativeDates = new Set<string>(ENTITY_LIST_RELATIVE_DATE_VALUES);
const scalar = (value: unknown) => typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
/** Validates a filter value before it reaches SQL. `fieldType` is the field's
 * declared type: date and datetime values must be written exactly (a date as
 * YYYY-MM-DD, an instant with an explicit offset), because the value is
 * compared in SQL as given. */
export function validateFilterValue(filter: RecordFilter, fieldType?: string): void {
  const value = filter.value;
  let valid = false;
  switch (filter.operator) {
    case "is_null": case "is_not_null": valid = value === undefined || value === null; break;
    case "relative": valid = typeof value === "string" && relativeDates.has(value); break;
    case "between": valid = Array.isArray(value) && value.length === 2 && value.every(scalar); break;
    case "in": valid = Array.isArray(value) && value.length > 0 && value.length <= MAX_LIST_FILTER_VALUES && value.every(scalar); break;
    case "contains": case "starts_with": valid = typeof value === "string"; break;
    case "eq": case "ne": valid = value === null || scalar(value); break;
    case "gt": case "gte": case "lt": case "lte": valid = scalar(value); break;
    default: throw new RecordServiceError(400, "FILTER_OPERATOR_NOT_ALLOWED", "Unsupported filter operator");
  }
  if (valid && temporalFilterValueError(fieldType, filter.operator, filter.value as never)) valid = false;
  if (!valid) throw new RecordServiceError(400, "INVALID_FILTER_VALUE", "Invalid value for filter operator", { field: filter.field, operator: filter.operator });
}
