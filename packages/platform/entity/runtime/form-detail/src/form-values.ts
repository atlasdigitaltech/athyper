import type { EntitySurfaceFieldV1 } from "@athyper/contract-platform-entity-runtime";

const numericKinds: ReadonlySet<EntitySurfaceFieldV1["kind"]> = new Set([
  "integer",
  "decimal",
  "money",
]);

/** Converts a form control value to its submit value. An empty optional field
 * is cleared with `null`. An empty or non-numeric required number is left as
 * entered so the server rejects it; it must never be coerced to `0`. */
export function normalizeFieldValue(
  value: unknown,
  field: Pick<EntitySurfaceFieldV1, "kind" | "required">,
): unknown {
  const empty = value === "" || value === undefined;
  if (empty && !field.required) return null;
  if (
    numericKinds.has(field.kind) &&
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

/** An unvisited optional control has no value in form state. During create it
 * must be omitted so server-side and metadata defaults can take effect. An
 * explicit empty-string edit is instead normalized to `null` above. */
export function isUntouchedOptionalCreateField(
  value: unknown,
  field: Pick<EntitySurfaceFieldV1, "required">,
): boolean {
  return value === undefined && !field.required;
}
