import "server-only";

import { z } from "zod";

// ─── Reserved Names ────────────────────────────────────────────
// System-managed columns that cannot be used as custom field names.

export const RESERVED_FIELD_NAMES = new Set([
  "id",
  "tenant_id",
  "realm_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "version",
]);

// ─── Shared Primitives ────────────────────────────────────────

const snakeCaseName = z
  .string()
  .min(1, "Name is required")
  .max(128, "Name must be ≤ 128 characters")
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Must be lowercase snake_case starting with a letter",
  );

const nonReservedName = snakeCaseName.refine(
  (n) => !RESERVED_FIELD_NAMES.has(n),
  "This name is reserved by the system",
);

// ─── Entity Schemas ───────────────────────────────────────────

export const createEntitySchema = z.object({
  name: snakeCaseName,
  kind: z.enum(["ref", "ent", "doc", "fin", "cfg", "int"]),
  tableSchema: z.string().min(1).max(63).default("public"),
  tableName: snakeCaseName,
  moduleId: z.string().nullish(),
  governanceLevel: z.enum(["full", "light", "audit_only"]).default("full"),
  engineTag: z.string().max(128).nullish(),
});

export const updateEntitySchema = z.object({
  name: snakeCaseName.optional(),
  kind: z.enum(["ref", "ent", "doc", "fin", "cfg", "int"]).optional(),
  tableSchema: z.string().min(1).max(63).optional(),
  tableName: snakeCaseName.optional(),
  moduleId: z.string().nullish(),
  isActive: z.boolean().optional(),
  governanceLevel: z.enum(["full", "light", "audit_only"]).optional(),
  engineTag: z.string().max(128).nullish(),
});

// ─── Field Schemas ────────────────────────────────────────────

const DATA_TYPES = [
  "string",
  "text",
  "number",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "uuid",
  "reference",
  "enum",
  "json",
] as const;

const UI_TYPES = [
  "text",
  "textarea",
  "number",
  "toggle",
  "select",
  "datepicker",
  "reference-picker",
  "json-editor",
  "hidden",
] as const;

export const createFieldSchema = z.object({
  name: nonReservedName,
  columnName: nonReservedName,
  dataType: z.enum(DATA_TYPES),
  uiType: z.enum(UI_TYPES).nullish(),
  isRequired: z.boolean().default(false),
  isUnique: z.boolean().default(false),
  isSearchable: z.boolean().default(false),
  isFilterable: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  validation: z.record(z.unknown()).nullish(),
  lookupConfig: z.record(z.unknown()).nullish(),
});

export const updateFieldSchema = z.object({
  fieldId: z.string().uuid(),
  name: nonReservedName.optional(),
  columnName: nonReservedName.optional(),
  dataType: z.enum(DATA_TYPES).optional(),
  uiType: z.enum(UI_TYPES).nullish(),
  isRequired: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  isSearchable: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  validation: z.record(z.unknown()).nullish(),
  lookupConfig: z.record(z.unknown()).nullish(),
});

export const deleteFieldSchema = z.object({
  fieldId: z.string().uuid(),
});

export const reorderFieldsSchema = z.object({
  fieldIds: z.array(z.string().uuid()).min(1, "At least one field ID required"),
  revisionId: z.string().optional(),
});

// ─── Relation Schemas ─────────────────────────────────────────

export const createRelationSchema = z.object({
  name: snakeCaseName,
  relationKind: z.enum(["belongs_to", "has_many", "m2m"]),
  targetEntity: z.string().min(1),
  fkField: z.string().nullish(),
  targetKey: z.string().nullish(),
  onDelete: z.enum(["restrict", "cascade", "set_null"]).default("restrict"),
  uiBehavior: z.record(z.unknown()).nullish(),
});

// ─── Index Schemas ────────────────────────────────────────────

export const createIndexSchema = z.object({
  name: snakeCaseName,
  isUnique: z.boolean().default(false),
  method: z.enum(["btree", "gin", "gist", "hash"]).default("btree"),
  columns: z
    .array(z.string().min(1))
    .min(1, "At least one column required")
    .max(16, "Max 16 columns"),
  whereClause: z.string().max(1024).nullish(),
});

// ─── Policy Schemas ───────────────────────────────────────────

export const savePolicySchema = z.object({
  accessMode: z.string().min(1),
  ouScopeMode: z.string().min(1),
  auditMode: z.string().min(1),
  retentionPolicy: z.record(z.unknown()).nullish(),
  defaultFilters: z.record(z.unknown()).nullish(),
  cacheFlags: z.record(z.unknown()).nullish(),
});

export const saveFieldSecuritySchema = z.object({
  fieldPath: z.string().min(1),
  policyType: z.enum(["read", "write", "both"]),
  roleList: z.string().nullish(),
  abacCondition: z.record(z.unknown()).nullish(),
  maskStrategy: z.enum(["null", "redact", "hash", "partial", "remove"]),
  maskConfig: z.record(z.unknown()).nullish(),
  scope: z.string().default("default"),
  priority: z.number().int().min(0).max(9999).default(100),
  isActive: z.boolean().default(true),
});

// ─── Overlay Schemas ──────────────────────────────────────────

const overlayChangeSchema = z.object({
  changeOrder: z.number().int().min(0),
  kind: z.enum([
    "addField",
    "removeField",
    "modifyField",
    "tweakPolicy",
    "overrideValidation",
    "overrideUi",
  ]),
  path: z.string().min(1),
  value: z.unknown(),
});

export const saveOverlaySchema = z.object({
  overlayKey: z.string().min(1).max(128),
  priority: z.number().int().min(0).max(9999).default(100),
  conflictMode: z.enum(["fail", "overwrite", "merge"]).default("fail"),
  isActive: z.boolean().default(true),
  changes: z.array(overlayChangeSchema).min(1, "At least one change required"),
});

// ─── Version Schemas ──────────────────────────────────────────

export const createVersionSchema = z
  .object({
    label: z.string().max(256).nullish(),
    cloneFrom: z.string().uuid().nullish(),
  })
  .default({});

// ─── Validation Rule Schemas ────────────────────────────────

const VALIDATION_RULE_KINDS = [
  "required",
  "min_max",
  "length",
  "regex",
  "enum",
  "cross_field",
  "conditional",
  "date_range",
  "referential",
  "unique",
] as const;

const VALIDATION_SEVERITIES = ["error", "warning"] as const;
const VALIDATION_PHASES = ["beforePersist", "beforeTransition"] as const;
const VALIDATION_TRIGGERS = ["create", "update", "transition", "all"] as const;

const CONDITION_OPERATORS = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches",
  "exists",
  "not_exists",
  "between",
  "empty",
  "not_empty",
  "date_before",
  "date_after",
] as const;

const conditionLeafSchema: z.ZodType<{
  field: string;
  operator: string;
  value?: unknown;
}> = z.object({
  field: z.string().min(1),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.unknown(),
});

// Recursive condition group schema
const conditionGroupSchema: z.ZodType<{
  operator?: "and" | "or";
  conditions: unknown[];
}> = z.lazy(() =>
  z.object({
    operator: z.enum(["and", "or"]).optional(),
    conditions: z
      .array(z.union([conditionLeafSchema, conditionGroupSchema]))
      .min(1),
  }),
);

const baseRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(256),
  kind: z.enum(VALIDATION_RULE_KINDS),
  severity: z.enum(VALIDATION_SEVERITIES).default("error"),
  appliesOn: z.array(z.enum(VALIDATION_TRIGGERS)).min(1),
  phase: z.enum(VALIDATION_PHASES).default("beforePersist"),
  fieldPath: z.string().min(1),
  message: z.string().max(1024).optional(),
});

/**
 * Full validation rule schema (loose — accepts all rule kinds with optional extra fields).
 * Backend performs kind-specific validation.
 */
export const validationRuleSchema: z.ZodType<Record<string, unknown>> =
  baseRuleSchema.extend({
    // min_max
    min: z.number().optional(),
    max: z.number().optional(),
    // length
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    // regex
    pattern: z.string().optional(),
    flags: z.string().optional(),
    // enum
    allowedValues: z.array(z.string()).optional(),
    // cross_field
    compareField: z.string().optional(),
    operator: z.enum(CONDITION_OPERATORS).optional(),
    // conditional
    when: conditionGroupSchema.optional(),
    then: z.lazy(() => z.array(validationRuleSchema)).optional(),
    // date_range
    afterField: z.string().optional(),
    beforeField: z.string().optional(),
    minDate: z.string().optional(),
    maxDate: z.string().optional(),
    // referential
    targetEntity: z.string().optional(),
    targetField: z.string().optional(),
    // unique
    scope: z.array(z.string()).optional(),
  });

export const saveValidationRulesSchema = z.object({
  version: z.number().int().min(1).default(1),
  rules: z.array(validationRuleSchema).max(200, "Max 200 rules per entity"),
});

export const testValidationSchema = z.object({
  action: z.literal("test"),
  payload: z.record(z.unknown()),
  rules: z.array(validationRuleSchema).optional(),
  trigger: z.enum(VALIDATION_TRIGGERS).default("create"),
});
