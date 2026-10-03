/** An explicit published DTO allowlist for a stored/read-model JSON array.
 * Reference values remain technical coordinates; this contract grants no label
 * lookup or target-record access. Nested objects and undeclared keys are denied. */
export interface StructuredProjection {
  readonly kind: "object_array";
  readonly maxItems: number;
  readonly fields: readonly {
    readonly key: string;
    readonly type: "string" | "uuid" | "integer" | "decimal" | "boolean";
    readonly nullable: boolean;
  }[];
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function parseStructuredProjection(
  value: unknown,
): StructuredProjection {
  if (
    !object(value) ||
    value.kind !== "object_array" ||
    !Number.isInteger(value.maxItems) ||
    Number(value.maxItems) < 1 ||
    Number(value.maxItems) > 1000 ||
    Object.keys(value).some(
      (key) => !["kind", "maxItems", "fields"].includes(key),
    ) ||
    !Array.isArray(value.fields) ||
    !value.fields.length ||
    value.fields.length > 50
  )
    throw new TypeError("Invalid structured projection contract");
  const fields = value.fields.map((field) => {
    if (
      !object(field) ||
      typeof field.key !== "string" ||
      !/^[a-z][a-z0-9_]*$/.test(field.key) ||
      typeof field.type !== "string" ||
      !["string", "uuid", "integer", "decimal", "boolean"].includes(
        String(field.type),
      ) ||
      typeof field.nullable !== "boolean" ||
      Object.keys(field).some(
        (key) => !["key", "type", "nullable"].includes(key),
      )
    )
      throw new TypeError("Invalid structured projection field");
    return Object.freeze({
      key: field.key,
      type: field.type as StructuredProjection["fields"][number]["type"],
      nullable: field.nullable,
    });
  });
  if (new Set(fields.map((field) => field.key)).size !== fields.length)
    throw new TypeError("Duplicate structured projection field");
  return Object.freeze({
    kind: "object_array",
    maxItems: Number(value.maxItems),
    fields: Object.freeze(fields),
  });
}
export function validateStructuredProjectionValue(
  value: unknown,
  declaration: StructuredProjection,
): void {
  const contract = parseStructuredProjection(declaration);
  if (!Array.isArray(value) || value.length > contract.maxItems)
    throw new TypeError(
      "Structured projection array required or limit exceeded",
    );
  const keys = new Set(contract.fields.map((field) => field.key));
  for (const row of value) {
    if (!object(row) || Object.keys(row).some((key) => !keys.has(key)))
      throw new TypeError("Undeclared structured projection member");
    for (const field of contract.fields) {
      const item = row[field.key];
      if (item === null && field.nullable) continue;
      const valid =
        field.type === "boolean"
          ? typeof item === "boolean"
          : field.type === "integer"
            ? typeof item === "number" && Number.isSafeInteger(item)
            : field.type === "decimal"
              ? typeof item === "number" && Number.isFinite(item)
              : typeof item === "string" &&
                (field.type !== "uuid" ||
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    item,
                  ));
      if (!valid)
        throw new TypeError(
          `Invalid structured projection value: ${field.key}`,
        );
    }
  }
}
