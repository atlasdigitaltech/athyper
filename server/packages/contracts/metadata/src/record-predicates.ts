/** Immutable dataset restrictions; applied to reads and writes before user filters. */
export interface RecordPredicate {
  readonly field: string;
  readonly operator: "eq" | "ne";
  readonly value: string | number | boolean;
}
export function parseRecordPredicates(
  value: unknown,
): readonly RecordPredicate[] {
  if (!Array.isArray(value) || !value.length || value.length > 16)
    throw TypeError("Invalid record predicates");
  return Object.freeze(
    value.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw TypeError("Invalid record predicate");
      const row = raw as Record<string, unknown>;
      if (
        Object.keys(row).sort().join() !== "field,operator,value" ||
        typeof row.field !== "string" ||
        !/^[a-z][a-z0-9_]{1,62}$/.test(row.field) ||
        !["eq", "ne"].includes(String(row.operator)) ||
        !["string", "boolean", "number"].includes(typeof row.value) ||
        (typeof row.value === "number" && !Number.isFinite(row.value))
      )
        throw TypeError("Invalid record predicate");
      return Object.freeze({
        field: row.field,
        operator: row.operator as "eq" | "ne",
        value: row.value as string | number | boolean,
      });
    }),
  );
}
