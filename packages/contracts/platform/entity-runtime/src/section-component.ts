/** Published component references carry field mappings only, never executable UI,
 * URLs, authorization decisions, or personal values. All planes share this registry. */
export interface EntitySectionComponentV1 {
  readonly rendererKey: "platform.address.fields.v1";
  readonly bindings: Readonly<Partial<Record<"line1" | "line2" | "line3" | "city" | "region" | "postalCode" | "country" | "timezone" | "kind", string>>>;
}
const addressRoles = ["line1", "line2", "line3", "city", "region", "postalCode", "country", "timezone", "kind"] as const;

export function parseEntitySectionComponent(value: unknown, fields: readonly string[]): EntitySectionComponentV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw TypeError("Invalid section component");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== "bindings,rendererKey" || row.rendererKey !== "platform.address.fields.v1" ||
      !row.bindings || typeof row.bindings !== "object" || Array.isArray(row.bindings)) throw TypeError("Unregistered section component");
  const bindings = row.bindings as Record<string, unknown>;
  const values = Object.values(bindings);
  if (!values.length || values.length > addressRoles.length || new Set(values).size !== values.length ||
      Object.entries(bindings).some(([role, field]) => !addressRoles.includes(role as typeof addressRoles[number]) ||
        typeof field !== "string" || !fields.includes(field))) throw TypeError("Invalid section component field mapping");
  return Object.freeze({ rendererKey: row.rendererKey, bindings: Object.freeze({ ...bindings }) as EntitySectionComponentV1["bindings"] });
}

/** Drop an incomplete specialized layout rather than disclosing hidden mapping
 * keys or letting the component fetch a dependency outside admitted fields. */
export function readableEntitySectionComponent(component: EntitySectionComponentV1 | undefined, fields: readonly string[]): EntitySectionComponentV1 | undefined {
  return component && Object.values(component.bindings).every(field => fields.includes(field!)) ? component : undefined;
}
