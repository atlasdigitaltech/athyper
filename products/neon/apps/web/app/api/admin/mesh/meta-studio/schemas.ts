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

// ─── Identity Config (must be declared before entity schemas) ─

const identityConfigSchema = z
  .object({
    primaryLabelField: z.string().min(1),
    primaryCodeField: z.string().nullish(),
    alternateKeys: z.array(z.string()).max(10).optional(),
    searchAliases: z.array(z.string()).max(20).optional(),
    displayTemplate: z.string().max(512).nullish(),
  })
  .nullish();

// ─── Entity Schemas ───────────────────────────────────────────

export const createEntitySchema = z.object({
  name: snakeCaseName,
  entityClass: z.enum(["REFERENCE", "MASTER", "DOCUMENT", "CONTROL", "LEDGER", "LOG"]),
  tableSchema: z.string().min(1).max(63).default("custom"),
  tableName: snakeCaseName,
  moduleId: z.string().nullish(),
  governanceLevel: z.enum(["full", "light", "audit_only"]).default("full"),
  engineTag: z.string().max(128).nullish(),
  identityConfig: identityConfigSchema,
});

export const updateEntitySchema = z.object({
  // Identity & codes (entity table)
  name: snakeCaseName.optional(),
  entityShort: z.string().max(32).nullish(),
  slug: z
    .string()
    .max(128)
    .regex(/^[a-z][a-z0-9-]*$/, "Must be lowercase kebab-case starting with a letter")
    .nullish(),
  moduleId: z.string().nullish(),
  tableSchema: z.string().min(1).max(63).optional(),
  tableName: snakeCaseName.optional(),
  identityConfig: identityConfigSchema,

  // Classification & behavior (entity table + runtime profile satellite)
  entityClass: z.enum(["REFERENCE", "MASTER", "DOCUMENT", "CONTROL", "LEDGER", "LOG"]).nullish(),
  status: z.enum(["draft", "active", "deprecated", "suspended"]).optional(),
  isActive: z.boolean().optional(),
  governanceLevel: z.enum(["full", "light", "audit_only"]).optional(),
  mappingMode: z.enum(["exclusive", "shared"]).optional(),
  ownershipModel: z.string().max(64).nullish(),
  mutability: z.string().max(64).nullish(),
  backingType: z.enum(["table", "view", "virtual"]).nullish(),
  engineTag: z.string().max(128).nullish(),

  // Display & UX (entity_ui_profile satellite)
  labelSingular: z.string().max(256).nullish(),
  labelPlural: z.string().max(256).nullish(),
  description: z.string().max(2048).nullish(),
  iconKey: z.string().max(64).nullish(),
  colorToken: z.string().max(64).nullish(),
  displayConfig: z.record(z.unknown()).nullish(),
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
  "rich_text",
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

// ── Shared sub-schemas for structured configs ──

const visibilityValueSchema = z.enum(["visible", "hidden", "internal"]);
const editabilityValueSchema = z.enum([
  "editable",
  "read_only",
  "system_managed",
  "computed",
]);

const visibilityDefaultsSchema = z.object({
  create: visibilityValueSchema.optional(),
  view: visibilityValueSchema.optional(),
  edit: visibilityValueSchema.optional(),
});

const behaviorConditionLeafSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.unknown().optional(),
});

const behaviorConditionGroupSchema: z.ZodType<{
  operator?: "and" | "or";
  conditions: Array<unknown>;
}> = z.lazy(() =>
  z.object({
    operator: z.enum(["and", "or"]).optional(),
    conditions: z.array(z.union([behaviorConditionLeafSchema, behaviorConditionGroupSchema])),
  }),
);

const visibilityRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  when: behaviorConditionGroupSchema,
  then: visibilityValueSchema,
  contexts: z.array(z.enum(["create", "view", "edit"])),
  priority: z.number(),
});

const editabilityRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  when: behaviorConditionGroupSchema,
  then: editabilityValueSchema,
  contexts: z.array(z.enum(["create", "edit"])),
  priority: z.number(),
});

const visibilitySchema = z.object({
  defaults: visibilityDefaultsSchema.optional(),
  rules: z.array(visibilityRuleSchema).optional(),
}).nullish();

const editabilityDefaultsSchema = z.object({
  create: editabilityValueSchema.optional(),
  edit: editabilityValueSchema.optional(),
});

const editabilitySchema = z.object({
  defaults: editabilityDefaultsSchema.optional(),
  rules: z.array(editabilityRuleSchema).optional(),
}).nullish();

/** Legacy flat format aliases for overlay schemas */
const visibilityRulesSchema = visibilityDefaultsSchema;
const editabilityRulesSchema = editabilityDefaultsSchema;

const overlayModeSchema = z.enum(["replace", "extend"]);

/** Visibility overlay: { mode: "replace"|"extend", rules: { create?, view?, edit? } } */
export const visibilityOverlaySchema = z
  .object({
    mode: overlayModeSchema,
    rules: visibilityRulesSchema,
  })
  .nullish();

/** Editability overlay: { mode: "replace"|"extend", rules: { create?, edit? } } */
export const editabilityOverlaySchema = z
  .object({
    mode: overlayModeSchema,
    rules: editabilityRulesSchema,
  })
  .nullish();

/** Validation rules overlay: { mode: "replace"|"extend", rules: [...] } */
export const validationOverlaySchema = z
  .object({
    mode: overlayModeSchema,
    rules: z.array(z.record(z.unknown())),
  })
  .nullish();

const collectionBehaviorSchema = z
  .object({
    ownership: z.enum(["owned", "linked"]).optional(),
    persistenceMode: z.enum(["inline", "reference_only"]).optional(),
    deleteMode: z.enum(["cascade", "restrict", "detach"]).optional(),
    ordering: z.boolean().optional(),
    orderField: z.string().optional(),
    editorStyle: z.enum(["grid", "subform", "tags"]).optional(),
    minItems: z.number().int().min(0).optional(),
    maxItems: z.number().int().min(1).optional(),
    allowDuplicates: z.boolean().optional(),
    aggregates: z
      .array(
        z.object({
          field: z.string(),
          op: z.enum(["count", "sum", "avg", "min", "max"]),
          label: z.string().optional(),
        }),
      )
      .optional(),
    aggregateStrategy: z.enum(["live", "on_save", "manual"]).optional(),
    allowDraftRows: z.boolean().optional(),
    rowValidation: z.enum(["on_change", "on_save", "on_submit"]).optional(),
  })
  .superRefine((val, ctx) => {
    if (val) {
      // allowDuplicates only meaningful for linked mode
      if (val.allowDuplicates === true && val.ownership === "owned") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "allowDuplicates is only valid for linked ownership mode",
          path: ["allowDuplicates"],
        });
      }
      // minItems must be <= maxItems when both set
      if (val.minItems != null && val.maxItems != null && val.minItems > val.maxItems) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "minItems must be ≤ maxItems",
          path: ["minItems"],
        });
      }
      // orderField requires ordering=true
      if (val.orderField && val.ordering !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "orderField requires ordering to be true",
          path: ["orderField"],
        });
      }
    }
  })
  .nullish();

const lookupSearchFieldSchema = z.object({
  field: z.string().min(1),
  weight: z.number().min(0).max(100).optional(),
  matchModes: z.array(z.enum(["exact", "prefix", "contains", "token"])).optional(),
});

const lookupProfileSchema = z
  .object({
    displayTemplate: z.string().max(512).nullish(),
    searchFields: z.array(lookupSearchFieldSchema).max(20).optional(),
    matchMode: z.enum(["exact", "prefix", "contains", "token"]).optional(),
    filters: z.record(z.unknown()).nullish(),
    filtersByContext: z.record(z.record(z.unknown())).nullish(),
    orderBy: z.string().max(128).nullish(),
    minChars: z.number().int().min(1).max(10).optional(),
    debounceMs: z.number().int().min(50).max(2000).optional(),
    pageSize: z.number().int().min(5).max(100).optional(),
    cacheMode: z.enum(["none", "session", "global"]).optional(),
    securityScope: z.string().max(64).nullish(),
  })
  .nullish();

// ── Type-safe constraint schemas per data-type family ──

const baseConstraintsSchema = z.object({
  required: z.boolean().optional(),
  nullable: z.boolean().optional(),
});

const stringConstraintsSchema = baseConstraintsSchema.extend({
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  pattern: z.string().max(1024).optional(),
});

const numericConstraintsSchema = baseConstraintsSchema.extend({
  min: z.number().optional(),
  max: z.number().optional(),
  precision: z.number().int().min(1).max(38).optional(),
  scale: z.number().int().min(0).max(20).optional(),
});

const dateConstraintsSchema = baseConstraintsSchema.extend({
  minDate: z.string().max(64).optional(),
  maxDate: z.string().max(64).optional(),
});

const enumConstraintsSchema = baseConstraintsSchema.extend({
  allowedValues: z.array(z.string()).max(500).optional(),
});

/**
 * Constraint schema map by data-type family.
 * Used by superRefine to reject invalid constraint+dataType combinations.
 */
const CONSTRAINTS_SCHEMA_BY_FAMILY: Record<string, z.ZodType<Record<string, unknown>>> = {
  string:    stringConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  text:      stringConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  rich_text: stringConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  integer:   numericConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  number:    numericConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  decimal:   numericConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  date:      dateConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  datetime:  dateConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  enum:      enumConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  boolean:   baseConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  uuid:      baseConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  reference: baseConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
  json:      baseConstraintsSchema as unknown as z.ZodType<Record<string, unknown>>,
};

/** Validate constraints are compatible with the field's dataType. */
function validateConstraintsForDataType(
  data: { dataType?: string; constraints?: Record<string, unknown> | null },
  ctx: z.RefinementCtx,
) {
  if (!data.constraints || !data.dataType) return;

  const schema = CONSTRAINTS_SCHEMA_BY_FAMILY[data.dataType];
  if (!schema) return;

  const result = schema.safeParse(data.constraints);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        ...issue,
        path: ["constraints", ...(issue.path || [])],
        message: `Invalid constraint for data type "${data.dataType}": ${issue.message}`,
      });
    }
  }

  // Reject unknown keys that don't belong to this data-type family
  const allowedKeys = new Set(Object.keys(
    CONSTRAINTS_SCHEMA_BY_FAMILY[data.dataType] === baseConstraintsSchema
      ? baseConstraintsSchema.shape
      : (schema as z.ZodObject<z.ZodRawShape>).shape,
  ));
  for (const key of Object.keys(data.constraints)) {
    if (!allowedKeys.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.unrecognized_keys,
        keys: [key],
        path: ["constraints"],
        message: `Constraint key "${key}" is not valid for data type "${data.dataType}"`,
      });
    }
  }
}

/**
 * Validate mutability flags don't contradict each other.
 *
 * Precedence: is_computed > is_read_only > write_once > editability > ui_hint
 * Contradictions:
 *   - is_computed + editability.{ctx}="editable" → Layer 1 vs Layer 5
 *   - is_read_only + editability.{ctx}="editable" → Layer 2 vs Layer 5
 *   - is_computed + write_once → both claim value lifecycle ownership
 *   - is_read_only + write_once → write_once implies writable on create
 */
function validateMutabilityFlags(
  data: {
    isComputed?: boolean;
    isReadOnly?: boolean;
    writeOnce?: boolean;
    editability?: { defaults?: { create?: string; edit?: string } } | null;
    computeMode?: string | null;
    computeExpr?: { type?: string; recomputeTrigger?: string; stalePolicy?: string } | null;
  },
  ctx: z.RefinementCtx,
) {
  const defaults = data.editability?.defaults;

  // is_computed + editability.defaults.{ctx}="editable" → contradiction
  if (data.isComputed) {
    if (defaults?.create === "editable") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editability", "defaults", "create"],
        message: "Cannot set editability to 'editable' when is_computed=true (computed fields are always read-only)",
      });
    }
    if (defaults?.edit === "editable") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editability", "defaults", "edit"],
        message: "Cannot set editability to 'editable' when is_computed=true (computed fields are always read-only)",
      });
    }
  }

  // is_read_only + editability.defaults.{ctx}="editable" → contradiction
  if (data.isReadOnly) {
    if (defaults?.create === "editable") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editability", "defaults", "create"],
        message: "Cannot set editability to 'editable' when is_read_only=true",
      });
    }
    if (defaults?.edit === "editable") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editability", "defaults", "edit"],
        message: "Cannot set editability to 'editable' when is_read_only=true",
      });
    }
  }

  // is_computed + write_once → contradiction
  if (data.isComputed && data.writeOnce) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["writeOnce"],
      message: "write_once and is_computed are mutually exclusive (computed fields never accept user input)",
    });
  }

  // is_read_only + write_once → contradiction
  if (data.isReadOnly && data.writeOnce) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["writeOnce"],
      message: "write_once and is_read_only are mutually exclusive (write_once implies writable on create)",
    });
  }

  // Materialized governance: recomputeTrigger/stalePolicy only valid for materialized mode
  if (data.computeExpr?.recomputeTrigger && data.computeMode !== "materialized") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["computeExpr", "recomputeTrigger"],
      message: "recomputeTrigger is only valid when computeMode is 'materialized'",
    });
  }
  if (data.computeExpr?.stalePolicy && data.computeMode !== "materialized") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["computeExpr", "stalePolicy"],
      message: "stalePolicy is only valid when computeMode is 'materialized'",
    });
  }
}

const SYSTEM_COMPUTE_FNS = ["now", "current_user", "current_tenant", "row_version", "uuid_generate"] as const;
const FORMULA_SAFE_PATTERN = /^[\sa-z_][a-z0-9_\s+\-*/().]*$/;

const computeExprSchema = z
  .object({
    type: z.enum(["formula", "aggregate", "system"]),
    expr: z.string(),
    dependsOn: z.array(z.string()).optional(),
    aggregateOf: z.string().optional(),
    aggregateOp: z.enum(["count", "sum", "avg", "min", "max"]).optional(),
    aggregateFilter: z.record(z.unknown()).optional(),
    recomputeTrigger: z.enum(["on_dependency_change", "on_save", "scheduled"]).optional(),
    stalePolicy: z.enum(["serve_stale", "null_until_recomputed", "recompute_sync"]).optional(),
    scheduleInterval: z.string().max(64).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val) return;

    // Formula: expr must be safe DSL (no function calls, no string literals)
    if (val.type === "formula") {
      if (!FORMULA_SAFE_PATTERN.test(val.expr)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Formula expr must contain only field references, numeric literals, and arithmetic operators (+, -, *, /)",
          path: ["expr"],
        });
      }
      // dependsOn is required for formula
      if (!val.dependsOn || val.dependsOn.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Formula type requires dependsOn listing all referenced fields",
          path: ["dependsOn"],
        });
      }
    }

    // Aggregate: requires aggregateOf + aggregateOp
    if (val.type === "aggregate") {
      if (!val.aggregateOf) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Aggregate type requires aggregateOf (child entity/collection field)",
          path: ["aggregateOf"],
        });
      }
      if (!val.aggregateOp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Aggregate type requires aggregateOp",
          path: ["aggregateOp"],
        });
      }
    }

    // System: expr must be in the allowlist
    if (val.type === "system") {
      if (!SYSTEM_COMPUTE_FNS.includes(val.expr as any)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `System compute function must be one of: ${SYSTEM_COMPUTE_FNS.join(", ")}`,
          path: ["expr"],
        });
      }
    }

    // scheduleInterval only valid with scheduled trigger
    if (val.scheduleInterval && val.recomputeTrigger !== "scheduled") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduleInterval requires recomputeTrigger to be 'scheduled'",
        path: ["scheduleInterval"],
      });
    }

    // scheduled trigger requires scheduleInterval
    if (val.recomputeTrigger === "scheduled" && !val.scheduleInterval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled recompute requires scheduleInterval",
        path: ["scheduleInterval"],
      });
    }
  })
  .nullish();

export const createFieldSchema = z.object({
  name: z.string().min(1, "Display name is required").max(256),
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

  // ── Phase 1: Structured configs & semantic format ──
  format: z.string().max(64).nullish(),
  unit: z.string().max(64).nullish(),
  cardinality: z.enum(["one", "many"]).default("one"),
  origin: z.enum(["system", "standard", "business"]).default("business"),
  label: z.string().max(256).nullish(),
  description: z.string().max(2048).nullish(),
  constraints: z.record(z.unknown()).nullish(),
  enumConfig: z.record(z.unknown()).nullish(),
  referenceConfig: z.record(z.unknown()).nullish(),
  jsonConfig: z.record(z.unknown()).nullish(),
  moneyConfig: z.record(z.unknown()).nullish(),
  datetimeConfig: z.record(z.unknown()).nullish(),
  uiHint: z.record(z.unknown()).nullish(),
  isReadOnly: z.boolean().default(false),
  isDeprecated: z.boolean().default(false),
  isComputed: z.boolean().default(false),
  writeOnce: z.boolean().default(false),

  // ── Enhancement 043: Visibility, editability, list caps, computed, collection ──
  visibility: visibilitySchema,
  editability: editabilitySchema,
  isSortable: z.boolean().default(false),
  isGroupable: z.boolean().default(false),
  isAggregatable: z.boolean().default(false),
  computeMode: z.enum(["virtual", "materialized"]).nullish(),
  computeExpr: computeExprSchema,
  childEntityName: z.string().max(128).nullish(),
  childFkField: z.string().max(128).nullish(),
  collectionBehavior: collectionBehaviorSchema,

  // ── Lookup system (044) ──
  lookupProfile: lookupProfileSchema,
}).superRefine(validateConstraintsForDataType).superRefine(validateMutabilityFlags);

export const updateFieldSchema = z.object({
  fieldId: z.string().uuid(),
  name: z.string().min(1).max(256).optional(),
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

  // ── Phase 1: Structured configs & semantic format ──
  format: z.string().max(64).nullish(),
  unit: z.string().max(64).nullish(),
  cardinality: z.enum(["one", "many"]).optional(),
  origin: z.enum(["system", "standard", "business"]).optional(),
  label: z.string().max(256).nullish(),
  description: z.string().max(2048).nullish(),
  constraints: z.record(z.unknown()).nullish(),
  enumConfig: z.record(z.unknown()).nullish(),
  referenceConfig: z.record(z.unknown()).nullish(),
  jsonConfig: z.record(z.unknown()).nullish(),
  moneyConfig: z.record(z.unknown()).nullish(),
  datetimeConfig: z.record(z.unknown()).nullish(),
  uiHint: z.record(z.unknown()).nullish(),
  isReadOnly: z.boolean().optional(),
  isDeprecated: z.boolean().optional(),
  isComputed: z.boolean().optional(),
  writeOnce: z.boolean().optional(),

  // ── Enhancement 043: Visibility, editability, list caps, computed, collection ──
  visibility: visibilitySchema,
  editability: editabilitySchema,
  isSortable: z.boolean().optional(),
  isGroupable: z.boolean().optional(),
  isAggregatable: z.boolean().optional(),
  computeMode: z.enum(["virtual", "materialized"]).nullish(),
  computeExpr: computeExprSchema,
  childEntityName: z.string().max(128).nullish(),
  childFkField: z.string().max(128).nullish(),
  collectionBehavior: collectionBehaviorSchema,

  // ── Lookup system (044) ──
  lookupProfile: lookupProfileSchema,
}).superRefine(validateConstraintsForDataType).superRefine(validateMutabilityFlags);

export const deleteFieldSchema = z.object({
  fieldId: z.string().uuid(),
});

export const deprecateFieldSchema = z.object({
  fieldId: z.string().uuid(),
  isDeprecated: z.boolean(),
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

// Reuse the condition schemas defined earlier (behaviorCondition*Schema)
const conditionLeafSchema = behaviorConditionLeafSchema;
const conditionGroupSchema = behaviorConditionGroupSchema;

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
