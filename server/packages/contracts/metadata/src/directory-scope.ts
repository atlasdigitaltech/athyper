import { parseEntityScopeFilters, type EntityScopeFilterV1 } from "@athyper/contract-platform-entity-list";
/** Published directory visibility; registered plane resolvers enforce these modes. */
export interface EntityDirectoryScopeV1 {
  readonly schemaVersion: 1;
  /** Required published parent relationship; never an optional client filter. */
  readonly parent?: { readonly entityCode: string; readonly relationshipKey: string };
  readonly quickFilters?: readonly EntityScopeFilterV1[];
  readonly filters?: readonly ("organization" | "company")[];
  readonly mode: "tenant" | "organization" | "company" | "organization_company";
}
export function parseEntityDirectoryScope(
  value: unknown,
): EntityDirectoryScopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid directory scope rule");
  const rule = value as Record<string, unknown>;
  if (
    Object.keys(rule).some((key) => !["schemaVersion", "mode", "filters", "quickFilters", "parent"].includes(key)) ||
    rule.schemaVersion !== 1 ||
    !["tenant", "organization", "company", "organization_company"].includes(
      String(rule.mode),
    )
  )
    throw new TypeError("Invalid directory scope rule");
  if (rule.filters !== undefined && (!Array.isArray(rule.filters) || rule.filters.some(item => !["organization", "company"].includes(item)) || new Set(rule.filters).size !== rule.filters.length)) throw new TypeError("Invalid directory filters");
  let parent: EntityDirectoryScopeV1["parent"];
  if (rule.parent !== undefined) {
    const value = rule.parent as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).sort().join() !== "entityCode,relationshipKey" ||
        typeof value.entityCode !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(value.entityCode) ||
        typeof value.relationshipKey !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(value.relationshipKey))
      throw new TypeError("Invalid required parent scope");
    parent = Object.freeze({ entityCode: value.entityCode, relationshipKey: value.relationshipKey });
  }
  return Object.freeze({
    ...(parent ? { parent } : {}),
    schemaVersion: 1,
    ...(rule.quickFilters === undefined ? {} : {quickFilters: parseEntityScopeFilters(rule.quickFilters)}),
    ...(rule.filters === undefined ? {} : { filters: Object.freeze([...rule.filters as ("organization" | "company")[]]) }),
    mode: rule.mode as EntityDirectoryScopeV1["mode"],
  });
}
