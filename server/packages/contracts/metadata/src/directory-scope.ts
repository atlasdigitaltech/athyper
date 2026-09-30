import { parseEntityScopeFilters, type EntityScopeFilterV1 } from "@athyper/contract-platform-entity-list";
/** Published directory visibility; registered plane resolvers enforce these modes. */
export interface EntityDirectoryScopeV1 {
  readonly schemaVersion: 1;
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
    Object.keys(rule).some((key) => !["schemaVersion", "mode", "filters", "quickFilters"].includes(key)) ||
    rule.schemaVersion !== 1 ||
    !["tenant", "organization", "company", "organization_company"].includes(
      String(rule.mode),
    )
  )
    throw new TypeError("Invalid directory scope rule");
  if (rule.filters !== undefined && (!Array.isArray(rule.filters) || rule.filters.some(item => !["organization", "company"].includes(item)) || new Set(rule.filters).size !== rule.filters.length)) throw new TypeError("Invalid directory filters");
  return Object.freeze({
    schemaVersion: 1,
    ...(rule.quickFilters === undefined ? {} : {quickFilters: parseEntityScopeFilters(rule.quickFilters)}),
    ...(rule.filters === undefined ? {} : { filters: Object.freeze([...rule.filters as ("organization" | "company")[]]) }),
    mode: rule.mode as EntityDirectoryScopeV1["mode"],
  });
}
