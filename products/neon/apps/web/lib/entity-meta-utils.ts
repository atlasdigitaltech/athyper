/**
 * Entity Metadata Utilities (Client-Safe)
 *
 * Pure string conversion functions for entity slug ↔ name transformations.
 * This file has NO server-side dependencies (no kysely, no sql) so it can
 * be safely imported by "use client" components.
 *
 * Server-side DB-backed resolution lives in entity-meta.ts.
 */

/** "chart-of-accounts" → "ChartOfAccounts" */
export function slugToEntityName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** "ChartOfAccounts" → "chart-of-accounts" */
export function entityNameToSlug(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** "ChartOfAccounts" → "Chart Of Accounts" */
export function entityNameToDisplayName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

// ── Type category helpers ──
// Client-safe versions of the helpers from entity-meta-fields.ts.
// Use these instead of direct === checks to handle the expanded type system.

/** Returns true for integer, decimal, number (any numeric data type) */
export function isNumericType(dataType: string): boolean {
  return dataType === "integer" || dataType === "decimal" || dataType === "number";
}

/** Returns true for date and datetime */
export function isDateLikeType(dataType: string): boolean {
  return dataType === "date" || dataType === "datetime";
}

/** Validates a slug is lowercase kebab-case (matches DB constraint) */
export function isValidEntitySlug(slug: string): boolean {
  return /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** Validates an entity_code is lowercase snake_case (matches DB constraint) */
export function isValidEntityCode(code: string): boolean {
  return /^[a-z][a-z0-9_]{1,79}$/.test(code);
}

// ── Entity Registry Status ──

/** Valid entity registry lifecycle statuses */
export type EntityRegistryStatus =
  | "draft"
  | "active"
  | "deprecated"
  | "suspended"
  | "retired";

const VALID_ENTITY_STATUSES = new Set<string>([
  "draft", "active", "deprecated", "suspended", "retired",
]);

/** Returns true if the status string is a valid EntityRegistryStatus */
export function isValidEntityStatus(status: string): status is EntityRegistryStatus {
  return VALID_ENTITY_STATUSES.has(status);
}

/** Returns true if the entity status allows data operations (create/update) */
export function isOperationalStatus(status: string): boolean {
  return status === "active" || status === "deprecated";
}

/**
 * Valid status transitions for entity registry lifecycle.
 * Key = current status, Value = set of allowed target statuses.
 */
export const ENTITY_STATUS_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft:      new Set(["active"]),
  active:     new Set(["deprecated", "suspended", "retired"]),
  deprecated: new Set(["active", "retired"]),
  suspended:  new Set(["active", "retired"]),
  retired:    new Set<string>(), // terminal
};

/** Returns true if the transition from `from` to `to` is valid */
export function isValidStatusTransition(from: string, to: string): boolean {
  return ENTITY_STATUS_TRANSITIONS[from]?.has(to) ?? false;
}

// ── Entity Ownership & Mutability ──

export type EntityOwnershipModel = "system" | "tenant" | "package" | "overlay";
export type EntityMutability = "locked" | "controlled" | "extensible" | "forkable";
export type EntityBackingType = "table" | "view" | "materialized_view" | "virtual" | "external" | "event_stream";

const VALID_OWNERSHIP_MODELS = new Set<string>(["system", "tenant", "package", "overlay"]);
const VALID_MUTABILITIES = new Set<string>(["locked", "controlled", "extensible", "forkable"]);
const VALID_BACKING_TYPES = new Set<string>(["table", "view", "materialized_view", "virtual", "external", "event_stream"]);

export function isValidOwnershipModel(v: string): v is EntityOwnershipModel {
  return VALID_OWNERSHIP_MODELS.has(v);
}

export function isValidMutability(v: string): v is EntityMutability {
  return VALID_MUTABILITIES.has(v);
}

export function isValidBackingType(v: string): v is EntityBackingType {
  return VALID_BACKING_TYPES.has(v);
}

/**
 * Returns true if the entity's mutability level allows the given mutation kind.
 *
 * Mutation kinds:
 *   'base_schema' — modify/delete base fields, rename entity
 *   'add_field'   — add new fields, relations, indexes
 *   'overlay'     — apply overlay extensions
 *   'fork'        — fork to tenant-owned copy
 */
export function isMutationAllowed(
  mutability: string,
  mutationKind: "base_schema" | "add_field" | "overlay" | "fork",
): boolean {
  switch (mutability) {
    case "locked":
      return false;
    case "controlled":
      return mutationKind === "overlay";
    case "extensible":
      return mutationKind === "overlay" || mutationKind === "add_field";
    case "forkable":
      return true;
    default:
      return false;
  }
}

// ── Data Policy ──

/**
 * Data-layer behavioral policy governing how entity rows are handled at runtime.
 * Stored as `data_policy` jsonb on meta.entity.
 */
export type EntityDataPolicy = {
  /** Enable soft-delete (is_deleted flag instead of physical DELETE) */
  soft_delete?: boolean;
  /** Append-only mode: rows cannot be updated after insert */
  append_only?: boolean;
  /** Temporal dating: effective_from/effective_to columns */
  temporal?: boolean;
  /** Rows become immutable when lifecycle reaches this state (e.g. "POSTED") */
  immutable_after_state?: string;
};

const DATA_POLICY_KEYS = new Set([
  "soft_delete", "append_only", "temporal", "immutable_after_state",
]);

/** Validates a data_policy object structure (client-safe) */
export function isValidDataPolicy(v: unknown): v is EntityDataPolicy {
  if (v === null || v === undefined) return true;
  if (typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!DATA_POLICY_KEYS.has(key)) return false;
  }
  if (obj.soft_delete !== undefined && typeof obj.soft_delete !== "boolean") return false;
  if (obj.append_only !== undefined && typeof obj.append_only !== "boolean") return false;
  if (obj.temporal !== undefined && typeof obj.temporal !== "boolean") return false;
  if (obj.immutable_after_state !== undefined && typeof obj.immutable_after_state !== "string") return false;
  return true;
}

// ── Provenance ──

/**
 * Deployment/package provenance metadata.
 * Stored as `provenance` jsonb on meta.entity.
 * Only relevant for system/package entities.
 */
export type EntityProvenance = {
  source_package?: string;
  source_version?: string;
  introduced_in_release?: string;
  deprecated_in_release?: string;
};

// ── Entity Feature Capabilities (derived capability snapshot) ──

/**
 * Infrastructure-level feature enablement for an entity.
 * Mirrors the EntityFeatureCapabilities type in @athyper/core/meta.
 */
export type EntityFeatureCapabilities = {
  fields: boolean;
  relations: boolean;
  indexes: boolean;
  compiledModel: boolean;
  permissionPolicies: boolean;
  fieldSecurity: boolean;
  lifecycle: boolean;
  overlays: boolean;
  numbering: boolean;
  approvals: boolean;
  effectiveDating: boolean;
  audit: boolean;
};

/**
 * Derive infrastructure-level feature capabilities from classification axes.
 *
 * Pure function — no DB, no side effects. Safe for client and server.
 *
 * Derivation order:
 *   1. entity_class determines the archetype's default capabilities
 *   2. governance_level acts as a ceiling (audit_only < light < full)
 *   3. feature_flags overrides can flip individual capabilities
 *
 * @param entityClass - Behavioral archetype (REFERENCE, MASTER, CONTROL, DOCUMENT, LEDGER, LOG)
 * @param governanceLevel - Meta infra depth (full, light, audit_only)
 * @param featureFlags - Optional overrides from meta.entity.feature_flags jsonb
 */
export function deriveEntityFeatureCapabilities(
  entityClass: string,
  governanceLevel: string,
  featureFlags?: Record<string, unknown> | null,
): EntityFeatureCapabilities {
  // ── Step 1: entity_class defaults (full governance assumed) ──
  const caps = classDefaults(entityClass);

  // ── Step 2: governance_level ceiling ──
  applyGovernanceCeiling(caps, governanceLevel);

  // ── Step 3: feature_flags overrides ──
  if (featureFlags) {
    applyOverrides(caps, featureFlags);
  }

  return caps;
}

/** Class-level defaults assuming full governance */
function classDefaults(entityClass: string): EntityFeatureCapabilities {
  // Base: structural capabilities always on
  const base: EntityFeatureCapabilities = {
    fields: true,
    relations: true,
    indexes: true,
    compiledModel: true,
    permissionPolicies: true,
    fieldSecurity: false,
    lifecycle: false,
    overlays: false,
    numbering: false,
    approvals: false,
    effectiveDating: false,
    audit: true,
  };

  switch (entityClass) {
    case "REFERENCE":
      // Immutable lookup data — minimal behavioral features
      base.permissionPolicies = true;
      break;

    case "MASTER":
      // Core business entities — overlays + effective dating + field security
      base.fieldSecurity = true;
      base.overlays = true;
      base.effectiveDating = true;
      break;

    case "CONTROL":
      // Configuration/rules — overlays + effective dating, no field security
      base.overlays = true;
      base.effectiveDating = true;
      break;

    case "DOCUMENT":
      // Full lifecycle — everything enabled
      base.fieldSecurity = true;
      base.lifecycle = true;
      base.overlays = true;
      base.numbering = true;
      base.approvals = true;
      break;

    case "LEDGER":
      // Immutable financial records — policies + field security, no overlays/lifecycle
      base.fieldSecurity = true;
      break;

    case "LOG":
      // Operational event streams — minimal meta infra
      base.compiledModel = false;
      base.permissionPolicies = false;
      base.audit = false;
      break;
  }

  return base;
}

/** Apply governance_level as a ceiling — lower levels disable capabilities */
function applyGovernanceCeiling(
  caps: EntityFeatureCapabilities,
  governanceLevel: string,
): void {
  if (governanceLevel === "audit_only") {
    // Minimal: only structural + audit
    caps.compiledModel = false;
    caps.permissionPolicies = false;
    caps.fieldSecurity = false;
    caps.lifecycle = false;
    caps.overlays = false;
    caps.numbering = false;
    caps.approvals = false;
    caps.effectiveDating = false;
    // audit stays as-is from class defaults
    return;
  }

  if (governanceLevel === "light") {
    // Structural + compiled model + audit, no rich features
    caps.permissionPolicies = false;
    caps.fieldSecurity = false;
    caps.lifecycle = false;
    caps.overlays = false;
    caps.numbering = false;
    caps.approvals = false;
    caps.effectiveDating = false;
    return;
  }

  // "full" — no ceiling, class defaults stand
}

/** Apply feature_flags overrides — boolean keys matching capability names */
function applyOverrides(
  caps: EntityFeatureCapabilities,
  flags: Record<string, unknown>,
): void {
  const capKeys: (keyof EntityFeatureCapabilities)[] = [
    "fields", "relations", "indexes", "compiledModel",
    "permissionPolicies", "fieldSecurity", "lifecycle", "overlays",
    "numbering", "approvals", "effectiveDating", "audit",
  ];
  for (const key of capKeys) {
    if (typeof flags[key] === "boolean") {
      caps[key] = flags[key] as boolean;
    }
  }
}

// ── Schema Evolution Guard ──

/**
 * Columns that become immutable once any version has been published.
 * These form the entity's stable identity and physical binding.
 * Changing them after publish would break compiled models, cached queries,
 * FK references, and runtime SQL generation.
 */
export const IMMUTABLE_AFTER_PUBLISH_COLUMNS = new Set([
  "tenant_id",
  "entity_code",
  "table_schema",
  "table_name",
  "kind",
  "entity_class",
  "mapping_mode",
  "backing_type",
]);

/**
 * Columns that are always mutable (display, config, lifecycle, ownership).
 * Listed explicitly for documentation — anything not in IMMUTABLE_AFTER_PUBLISH
 * is implicitly mutable.
 */
export const ALWAYS_MUTABLE_COLUMNS = new Set([
  "name",
  "slug",
  "entity_short",
  "module_id",
  "status",
  "status_changed_at",
  "status_changed_by",
  "status_reason",
  "updated_at",
  "updated_by",
  // NOTE: feature_flags, identity_config, data_policy, governance_level,
  // engine_tag, ownership_model, mutability now live on meta.entity_runtime_profile
  // NOTE: published_version_id, last_compiled_at, last_compiled_hash,
  // last_schema_change_at, provenance now live on meta.entity_publish_state
  // NOTE: label_singular, label_plural, description, icon_key, color_token,
  // display_config now live on meta.entity_ui_profile
  // NOTE: naming_policy now lives on meta.entity_numbering_policy
]);

export type EvolutionGuardResult =
  | { allowed: true }
  | { allowed: false; blockedColumns: string[]; reason: string };

/**
 * Checks whether the given column updates are allowed for an entity that
 * has published versions.
 *
 * Pure function — no DB access. The caller must determine `hasPublishedVersion`
 * before calling.
 *
 * @param columnNames - Set or array of column names being updated
 * @param hasPublishedVersion - Whether the entity has any published version
 * @returns Result with blocked columns if any are disallowed
 */
export function checkEvolutionGuard(
  columnNames: Iterable<string>,
  hasPublishedVersion: boolean,
): EvolutionGuardResult {
  if (!hasPublishedVersion) {
    return { allowed: true };
  }

  const blocked: string[] = [];
  for (const col of columnNames) {
    if (IMMUTABLE_AFTER_PUBLISH_COLUMNS.has(col)) {
      blocked.push(col);
    }
  }

  if (blocked.length === 0) {
    return { allowed: true };
  }

  return {
    allowed: false,
    blockedColumns: blocked,
    reason: `Cannot modify ${blocked.join(", ")} after entity has published versions`,
  };
}

/**
 * Maps camelCase update keys from the API to their snake_case column names.
 * Used by the Meta Studio BFF to translate client payloads before
 * running evolution guard checks.
 */
export const ENTITY_UPDATE_KEY_TO_COLUMN: Record<string, string> = {
  name: "name",
  kind: "kind",
  tableSchema: "table_schema",
  tableName: "table_name",
  moduleId: "module_id",
  entityClass: "entity_class",
  entityCode: "entity_code",
  slug: "slug",
  entityShort: "entity_short",
  mappingMode: "mapping_mode",
  backingType: "backing_type",
  // NOTE: governanceLevel, engineTag, featureFlags, identityConfig, dataPolicy,
  // ownershipModel, mutability → meta.entity_runtime_profile
  // NOTE: namingPolicy, displayConfig → meta.entity_numbering_policy / meta.entity_ui_profile
  // NOTE: labelSingular, labelPlural, description, iconKey, colorToken → meta.entity_ui_profile
  // NOTE: provenance → meta.entity_publish_state
};

// ── Field Reference Cross-Validation ──

/**
 * Extract {{token}} patterns from a template string.
 * Used for displayTemplate and naming_policy.pattern validation.
 */
export function extractTemplateTokens(template: string): string[] {
  const tokens: string[] = [];
  const re = /\{\{(\w+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

/** System tokens that are not field references in naming_policy.pattern */
const NAMING_SYSTEM_TOKENS = new Set([
  "seq", "YYYY", "YY", "MM", "DD", "entity_short", "entity_code",
]);

export type FieldRefDiagnostic = {
  path: string;
  referencedField: string;
  severity: "error" | "warning";
  message: string;
};

/**
 * Validate that all field references in display_config and naming_policy
 * resolve to fields in the provided field dictionary.
 *
 * Client-safe — no server dependencies.
 *
 * @param displayConfig  Raw display_config JSONB from meta.entity
 * @param namingPolicy   Raw naming_policy JSONB from meta.entity
 * @param fieldNames     Set of field names from the entity version's field dictionary
 * @param numberingEnabled  Whether numbering is enabled (from feature_flags)
 */
export function validateFieldReferences(
  displayConfig: Record<string, unknown> | null,
  namingPolicy: unknown,
  fieldNames: Set<string>,
  numberingEnabled = false,
): FieldRefDiagnostic[] {
  const diagnostics: FieldRefDiagnostic[] = [];
  if (fieldNames.size === 0) return diagnostics;

  // ── display_config references ──
  if (displayConfig) {
    // treeView
    if (displayConfig.treeView && typeof displayConfig.treeView === "object") {
      const tree = displayConfig.treeView as Record<string, unknown>;
      checkFieldRef(diagnostics, "display_config.treeView.parentField", tree.parentField, fieldNames, "error");
      checkFieldRef(diagnostics, "display_config.treeView.levelField", tree.levelField, fieldNames, "warning");
      checkFieldRef(diagnostics, "display_config.treeView.isGroupField", tree.isGroupField, fieldNames, "warning");
    }

    // displayFields
    if (Array.isArray(displayConfig.displayFields)) {
      for (const f of displayConfig.displayFields) {
        if (typeof f === "string") {
          checkFieldRef(diagnostics, "display_config.displayFields", f, fieldNames, "error");
        }
      }
    }

    // displayTemplate tokens
    if (typeof displayConfig.displayTemplate === "string") {
      for (const token of extractTemplateTokens(displayConfig.displayTemplate)) {
        checkFieldRef(diagnostics, "display_config.displayTemplate", token, fieldNames, "error");
      }
    }

    // groupableFields
    if (Array.isArray(displayConfig.groupableFields)) {
      for (const f of displayConfig.groupableFields) {
        if (typeof f === "string") {
          checkFieldRef(diagnostics, "display_config.groupableFields", f, fieldNames, "error");
        }
      }
    }
  }

  // ── naming_policy.pattern references ──
  if (numberingEnabled && namingPolicy && typeof namingPolicy === "object") {
    const np = namingPolicy as Record<string, unknown>;
    if (typeof np.pattern === "string") {
      for (const token of extractTemplateTokens(np.pattern)) {
        if (!NAMING_SYSTEM_TOKENS.has(token)) {
          checkFieldRef(diagnostics, "naming_policy.pattern", token, fieldNames, "warning");
        }
      }
    }
  }

  return diagnostics;
}

function checkFieldRef(
  diagnostics: FieldRefDiagnostic[],
  path: string,
  fieldName: unknown,
  fieldNames: Set<string>,
  severity: "error" | "warning",
): void {
  if (typeof fieldName !== "string" || !fieldName) return;
  if (!fieldNames.has(fieldName)) {
    diagnostics.push({
      path,
      referencedField: fieldName,
      severity,
      message: `${path} references "${fieldName}" which is not in the field dictionary.`,
    });
  }
}

// ── Backing Type ↔ Mapping Mode Compatibility ──

/**
 * Allowed mapping_mode values for each backing_type.
 * Used at publish time to detect physical-layer contradictions.
 */
export const BACKING_MAPPING_COMPATIBILITY: Record<string, readonly string[]> = {
  table: ["exclusive", "shared"],
  view: ["derived", "virtual"],
  materialized_view: ["derived"],
  virtual: ["virtual"],
  external: ["virtual"],
  event_stream: ["exclusive"],
};

/**
 * Returns null if compatible, or an error message if incompatible.
 */
export function checkBackingMappingCompatibility(
  backingType: string,
  mappingMode: string,
): string | null {
  const allowed = BACKING_MAPPING_COMPATIBILITY[backingType];
  if (!allowed) return null; // unknown backing type — skip (DB check constraint handles it)
  if (allowed.includes(mappingMode)) return null;
  return `backing_type "${backingType}" is incompatible with mapping_mode "${mappingMode}". Allowed: ${allowed.join(", ")}.`;
}

// ── Publish-Time Validation ──

/**
 * Input shape for publish-time cross-entity consistency checks.
 * The caller (BFF or service layer) assembles this from DB queries.
 */
export interface PublishValidationInput {
  entityName: string;
  entityClass: string;
  governanceLevel: string;
  featureFlags: Record<string, unknown> | null;
  namingPolicy: unknown | null;
  displayConfig: Record<string, unknown> | null;

  /** Identity columns */
  entityCode: string | null;
  slug: string | null;
  backingType: string;
  mappingMode: string;

  /** Whether a compiled artifact exists for the version being published */
  hasCompiledArtifact: boolean;
  /** Whether the entity is bound to at least one lifecycle in meta.entity_lifecycle */
  hasLifecycleBinding: boolean;
  /** Whether the entity has active overlays in meta.overlay */
  hasActiveOverlays: boolean;
  /** The conflict_mode values from active overlays (if any) */
  overlayConflictModes: string[];
  /** Whether the entity has active field security policies */
  hasFieldSecurityPolicies: boolean;

  /** Field names from the version's field dictionary (for cross-ref validation) */
  fieldNames: Set<string>;
}

export interface PublishValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

export type PublishValidationResult =
  | { valid: true; warnings: PublishValidationIssue[] }
  | { valid: false; errors: PublishValidationIssue[]; warnings: PublishValidationIssue[] };

/**
 * Runs cross-entity consistency checks before allowing a version to be published.
 *
 * Pure function — no DB access. The caller must assemble `PublishValidationInput`
 * from DB queries before calling.
 *
 * Categories:
 *   Identity    — entity_code, slug, backing/mapping compatibility
 *   Governance  — capability ↔ artifact coherence
 *   Behavior    — naming_policy, display_config field references
 *   Runtime     — lifecycle bindings, overlay conflict modes
 */
export function validatePublishReadiness(
  input: PublishValidationInput,
): PublishValidationResult {
  const errors: PublishValidationIssue[] = [];
  const warnings: PublishValidationIssue[] = [];

  const caps = deriveEntityFeatureCapabilities(
    input.entityClass,
    input.governanceLevel,
    input.featureFlags,
  );

  // ── Identity ──

  if (!input.entityCode) {
    errors.push({
      code: "MISSING_ENTITY_CODE",
      severity: "error",
      message: `Entity "${input.entityName}" has no entity_code. A stable machine-safe identity is required before publish.`,
    });
  }

  if (!input.slug) {
    errors.push({
      code: "MISSING_SLUG",
      severity: "error",
      message: `Entity "${input.entityName}" has no slug. A persisted URL-routing slug is required before publish.`,
    });
  }

  const backingErr = checkBackingMappingCompatibility(input.backingType, input.mappingMode);
  if (backingErr) {
    errors.push({
      code: "BACKING_MAPPING_MISMATCH",
      severity: "error",
      message: `Entity "${input.entityName}": ${backingErr}`,
    });
  }

  // ── Governance ──

  if (caps.compiledModel && !input.hasCompiledArtifact) {
    errors.push({
      code: "MISSING_COMPILED_ARTIFACT",
      severity: "error",
      message: `Entity "${input.entityName}" requires a compiled model (governance: ${input.governanceLevel}) but no compiled artifact exists for this version.`,
    });
  }

  if (!caps.overlays && input.hasActiveOverlays) {
    errors.push({
      code: "DISALLOWED_OVERLAYS",
      severity: "error",
      message: `Entity "${input.entityName}" (${input.governanceLevel}/${input.entityClass}) does not support overlays, but active overlays exist.`,
    });
  }

  if (!caps.lifecycle && input.hasLifecycleBinding) {
    errors.push({
      code: "DISALLOWED_LIFECYCLE",
      severity: "error",
      message: `Entity "${input.entityName}" (${input.governanceLevel}/${input.entityClass}) does not support lifecycle, but lifecycle bindings exist.`,
    });
  }

  if (!caps.fieldSecurity && input.hasFieldSecurityPolicies) {
    errors.push({
      code: "DISALLOWED_FIELD_SECURITY",
      severity: "error",
      message: `Entity "${input.entityName}" (${input.governanceLevel}/${input.entityClass}) does not support field security, but active policies exist.`,
    });
  }

  // ── Behavior ──

  // DOCUMENT + numbering_enabled → naming_policy required
  if (
    caps.numbering &&
    (input.featureFlags?.numbering_enabled === true ||
      (input.entityClass === "DOCUMENT" && input.featureFlags?.numbering_enabled !== false)) &&
    !input.namingPolicy
  ) {
    errors.push({
      code: "MISSING_NAMING_POLICY",
      severity: "error",
      message: `DOCUMENT entity "${input.entityName}" has numbering enabled but no naming_policy is defined.`,
    });
  }

  // Field reference cross-validation (display_config + naming_policy)
  const fieldRefIssues = validateFieldReferences(
    input.displayConfig,
    input.namingPolicy,
    input.fieldNames,
    input.featureFlags?.numbering_enabled === true,
  );
  for (const issue of fieldRefIssues) {
    (issue.severity === "error" ? errors : warnings).push({
      code: "FIELD_REF_" + issue.path.toUpperCase().replace(/\./g, "_"),
      severity: issue.severity,
      message: issue.message,
    });
  }

  // ── Runtime ──

  if (caps.lifecycle && !input.hasLifecycleBinding) {
    warnings.push({
      code: "MISSING_LIFECYCLE_BINDING",
      severity: "warning",
      message: `Entity "${input.entityName}" has lifecycle capability enabled but is not bound to any lifecycle definition.`,
    });
  }

  if (caps.overlays && input.hasActiveOverlays) {
    const missingMode = input.overlayConflictModes.some((m) => !m);
    if (missingMode) {
      warnings.push({
        code: "OVERLAY_MISSING_CONFLICT_MODE",
        severity: "warning",
        message: `Entity "${input.entityName}" has active overlays but some are missing a conflict_mode declaration.`,
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }
  return { valid: true, warnings };
}
