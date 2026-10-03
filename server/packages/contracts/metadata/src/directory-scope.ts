import {
  parseEntityScopeFilters,
  type EntityScopeFilterV1,
} from "@athyper/contract-platform-entity-list";
/** Published directory visibility; registered plane resolvers enforce these modes. */
export interface EntityDirectoryScopeV1 {
  readonly schemaVersion: 1;
  /** Exact persisted field bindings; never inferred from entity or column names. */
  readonly fieldBinding?: {
    readonly resolver: "neon.directory.fields.v1";
    readonly companyField?: string;
    readonly organizationField?: string;
  };
  /** Required published parent relationship; never an optional client filter. */
  readonly parent?: {
    readonly entityCode: string;
    readonly relationshipKey: string;
  };
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
    Object.keys(rule).some(
      (key) =>
        ![
          "schemaVersion",
          "mode",
          "filters",
          "quickFilters",
          "parent",
          "fieldBinding",
        ].includes(key),
    ) ||
    rule.schemaVersion !== 1 ||
    !["tenant", "organization", "company", "organization_company"].includes(
      String(rule.mode),
    )
  )
    throw new TypeError("Invalid directory scope rule");
  if (
    rule.filters !== undefined &&
    (!Array.isArray(rule.filters) ||
      rule.filters.some(
        (item) => !["organization", "company"].includes(item),
      ) ||
      new Set(rule.filters).size !== rule.filters.length)
  )
    throw new TypeError("Invalid directory filters");
  let parent: EntityDirectoryScopeV1["parent"];
  if (rule.parent !== undefined) {
    const value = rule.parent as Record<string, unknown>;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join() !== "entityCode,relationshipKey" ||
      typeof value.entityCode !== "string" ||
      !/^[a-z][a-z0-9_]{1,62}$/.test(value.entityCode) ||
      typeof value.relationshipKey !== "string" ||
      !/^[a-z][a-z0-9_]{1,62}$/.test(value.relationshipKey)
    )
      throw new TypeError("Invalid required parent scope");
    parent = Object.freeze({
      entityCode: value.entityCode,
      relationshipKey: value.relationshipKey,
    });
  }
  let fieldBinding: EntityDirectoryScopeV1["fieldBinding"];
  if (rule.fieldBinding !== undefined) {
    const binding = rule.fieldBinding as Record<string, unknown>;
    const company =
      rule.mode === "company" || rule.mode === "organization_company";
    const organization =
      rule.mode === "organization" || rule.mode === "organization_company";
    if (
      !binding ||
      typeof binding !== "object" ||
      Array.isArray(binding) ||
      Object.keys(binding).some(
        (key) =>
          !["resolver", "companyField", "organizationField"].includes(key),
      ) ||
      binding.resolver !== "neon.directory.fields.v1" ||
      rule.mode === "tenant" ||
      company !== (binding.companyField !== undefined) ||
      organization !== (binding.organizationField !== undefined) ||
      [binding.companyField, binding.organizationField].some(
        (field) =>
          field !== undefined &&
          (typeof field !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(field)),
      ) ||
      (company &&
        organization &&
        binding.companyField === binding.organizationField)
    )
      throw new TypeError("Invalid directory field binding");
    fieldBinding = Object.freeze({
      resolver: "neon.directory.fields.v1",
      ...(company ? { companyField: binding.companyField as string } : {}),
      ...(organization
        ? { organizationField: binding.organizationField as string }
        : {}),
    });
  }
  return Object.freeze({
    ...(fieldBinding ? { fieldBinding } : {}),
    ...(parent ? { parent } : {}),
    schemaVersion: 1,
    ...(rule.quickFilters === undefined
      ? {}
      : { quickFilters: parseEntityScopeFilters(rule.quickFilters) }),
    ...(rule.filters === undefined
      ? {}
      : {
          filters: Object.freeze([
            ...(rule.filters as ("organization" | "company")[]),
          ]),
        }),
    mode: rule.mode as EntityDirectoryScopeV1["mode"],
  });
}

/** Validate both during publication and runtime admission. */
export function validateDirectoryScopeFields(
  scope: EntityDirectoryScopeV1 | undefined,
  fields: readonly {
    readonly key: string;
    readonly type: string;
    readonly storagePath: string;
    readonly valueOrigin?: string;
    readonly writableOn: readonly string[];
  }[],
): void {
  if (!scope?.fieldBinding) return;
  for (const key of [
    scope.fieldBinding.companyField,
    scope.fieldBinding.organizationField,
  ]) {
    if (key === undefined) continue;
    const field = fields.find((candidate) => candidate.key === key);
    if (
      !field ||
      field.type !== "uuid" ||
      field.writableOn.length ||
      (field.valueOrigin !== undefined && field.valueOrigin !== "stored") ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(field.storagePath)
    )
      throw new TypeError(
        "Directory scope requires an immutable stored UUID field: " + key,
      );
  }
}
