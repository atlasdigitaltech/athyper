import { entityFieldFilterOperators, type EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import type { RecordFilterOperator } from "@athyper/server-contract-records";

/** One canonical operator policy shared by browser descriptors and query admission. */
export function recordFilterOperators(type: EntityFieldDescriptor["type"] | string | undefined): readonly RecordFilterOperator[] {
  const supported = ["string", "text", "integer", "decimal", "money", "boolean", "date", "datetime", "uuid", "enum", "reference", "json"] as const;
  const normalized = supported.find((candidate) => candidate === type) ?? "string";
  return entityFieldFilterOperators(normalized) as readonly RecordFilterOperator[];
}

/** Applies an Entity's optional restriction without ever widening the type policy. */
export function recordFieldFilterOperators(field: EntityFieldDescriptor): readonly RecordFilterOperator[] {
  const allowed = recordFilterOperators(field.type);
  const configured = field.list?.filterOperators;
  return Object.freeze(configured?.length ? configured.filter((operator) => allowed.includes(operator)) : [...allowed]);
}
