import { ENTITY_FIELD_TYPES, entityFieldFilterOperators, type EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import type { RecordFilterOperator } from "@athyper/server-contract-records";

/** One canonical operator policy shared by browser descriptors and query admission. */
export function recordFilterOperators(type: EntityFieldDescriptor["type"] | string | undefined): readonly RecordFilterOperator[] {
  const normalized = ENTITY_FIELD_TYPES.find((candidate) => candidate === type) ?? "string";
  return entityFieldFilterOperators(normalized) as readonly RecordFilterOperator[];
}

/** Applies an Entity's optional restriction without ever widening the type policy. */
export function recordFieldFilterOperators(field: EntityFieldDescriptor): readonly RecordFilterOperator[] {
  const allowed = recordFilterOperators(field.type);
  const configured = field.list?.filterOperators;
  return Object.freeze(configured?.length ? configured.filter((operator) => allowed.includes(operator)) : [...allowed]);
}
