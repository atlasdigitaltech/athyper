/**
 * META Compiler Service Implementation
 *
 * Compiles entity schemas into optimized Compiled Model IR.
 * Handles caching, validation, and cache invalidation.
 */

import { createHash } from "node:crypto";

import { META_SPANS, withSpan } from "../observability/tracing.js";

import type { MetaMetrics } from "../observability/metrics.js";
import {
  SYSTEM_COMPUTE_FUNCTIONS,
  extractFormulaFieldRefs,
  resolveCapabilityDefaults,
} from "@athyper/core/meta";
import type {
  CollectionBehavior,
  CompileDiagnostic,
  CompiledField,
  CompiledModel,
  CompiledModelWithOverlays,
  CompiledPolicy,
  CompiledSnapshot,
  ComputeExpression,
  ComputeMode,
  DiagnosticSeverity,
  EntitySchema,
  EnumConfig,
  FieldConstraints,
  FieldDefinition,
  FieldEditability,
  FieldType,
  FieldUiHint,
  FieldVisibility,
  HealthCheckResult,
  MetaCompiler,
  MetaRegistry,
  OverlayChange,
  OverlaySet,
  PolicyCondition,
  PolicyDefinition,
  ReferenceConfig,
  ResolvedFieldMeta,
  SemanticFormat,
  ValidationError,
  ValidationResult,
} from "@athyper/core/meta";
import type { Redis } from "ioredis";

/**
 * Compiler configuration
 */
export type CompilerConfig = {
  /** Redis cache instance */
  cache: Redis;

  /** Cache TTL in seconds (default: 3600 = 1 hour) */
  cacheTTL?: number;

  /** Enable caching (default: true) */
  enableCache?: boolean;
};

/**
 * META Compiler Service
 * Compiles schemas to optimized IR with Redis caching
 */
export class MetaCompilerService implements MetaCompiler {
  private readonly cacheTTL: number;
  private readonly enableCache: boolean;
  private metrics?: MetaMetrics;

  constructor(
    private readonly registry: MetaRegistry,
    private readonly config: CompilerConfig,
  ) {
    this.cacheTTL = config.cacheTTL ?? 3600; // 1 hour default
    this.enableCache = config.enableCache ?? true;
  }

  /** Set metrics collector for observability (late binding). */
  setMetrics(metrics: MetaMetrics): void {
    this.metrics = metrics;
  }

  // =========================================================================
  // Compilation
  // =========================================================================

  async compile(entityName: string, version: string): Promise<CompiledModel> {
    return withSpan(
      META_SPANS.COMPILE,
      { "meta.entity": entityName, "meta.version": version },
      async (span) => {
        const start = Date.now();

        // Try cache first
        if (this.enableCache) {
          const cached = await this.getCached(entityName, version);
          if (cached) {
            span.setAttribute("meta.cache_hit", true);
            this.metrics?.cacheHit({ entity: entityName });
            this.metrics?.compilationLatency(Date.now() - start, {
              entity: entityName,
            });
            return cached;
          }
          span.setAttribute("meta.cache_hit", false);
          this.metrics?.cacheMiss({ entity: entityName });
        }

        // Not in cache, compile and cache
        const result = await this.compileAndCache(entityName, version);
        this.metrics?.compilationLatency(Date.now() - start, {
          entity: entityName,
        });
        return result;
      },
    );
  }

  async recompile(entityName: string, version: string): Promise<CompiledModel> {
    // Invalidate cache first
    await this.invalidateCache(entityName, version);

    // Compile fresh
    return this.compileAndCache(entityName, version);
  }

  async validate(schema: EntitySchema): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Validate fields
    if (!schema.fields || schema.fields.length === 0) {
      errors.push({
        field: "fields",
        message: "Schema must have at least one field",
        code: "SCHEMA_NO_FIELDS",
      });
    }

    // Phase 1.2: Validate required system fields (HARD INVARIANT)
    this.validateSystemFields(schema, errors);

    for (const [index, field] of (schema.fields ?? []).entries()) {
      // Validate field name
      if (!field.name || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name)) {
        errors.push({
          field: `fields[${index}].name`,
          message: "Field name must be alphanumeric (camelCase)",
          code: "INVALID_FIELD_NAME",
          context: { fieldName: field.name },
        });
      }

      // Validate field type
      const validTypes = [
        "string",
        "number",
        "boolean",
        "date",
        "datetime",
        "reference",
        "enum",
        "json",
        "uuid",
      ];
      if (!validTypes.includes(field.type)) {
        errors.push({
          field: `fields[${index}].type`,
          message: `Invalid field type: ${field.type}`,
          code: "INVALID_FIELD_TYPE",
          context: { fieldType: field.type },
        });
      }

      // Validate reference field
      if (field.type === "reference" && !field.referenceTo) {
        errors.push({
          field: `fields[${index}].referenceTo`,
          message: "Reference field must specify 'referenceTo'",
          code: "MISSING_REFERENCE_TO",
          context: { fieldName: field.name },
        });
      }

      // Validate enum field
      if (field.type === "enum") {
        if (!field.enumValues || field.enumValues.length === 0) {
          errors.push({
            field: `fields[${index}].enumValues`,
            message: "Enum field must specify at least one value",
            code: "MISSING_ENUM_VALUES",
            context: { fieldName: field.name },
          });
        }
      }

      // Validate validation rules
      if (field.type === "string") {
        if (field.minLength !== undefined && field.minLength < 0) {
          errors.push({
            field: `fields[${index}].minLength`,
            message: "minLength must be >= 0",
            code: "INVALID_MIN_LENGTH",
          });
        }
        if (field.maxLength !== undefined && field.maxLength <= 0) {
          errors.push({
            field: `fields[${index}].maxLength`,
            message: "maxLength must be > 0",
            code: "INVALID_MAX_LENGTH",
          });
        }
        if (
          field.minLength !== undefined &&
          field.maxLength !== undefined &&
          field.minLength > field.maxLength
        ) {
          errors.push({
            field: `fields[${index}].minLength`,
            message: "minLength cannot be greater than maxLength",
            code: "INVALID_LENGTH_RANGE",
          });
        }
      }

      if (field.type === "number") {
        if (
          field.min !== undefined &&
          field.max !== undefined &&
          field.min > field.max
        ) {
          errors.push({
            field: `fields[${index}].min`,
            message: "min cannot be greater than max",
            code: "INVALID_NUMBER_RANGE",
          });
        }
      }
    }

    // Check for duplicate field names
    const fieldNames = new Set<string>();
    for (const field of schema.fields ?? []) {
      if (fieldNames.has(field.name)) {
        errors.push({
          field: "fields",
          message: `Duplicate field name: ${field.name}`,
          code: "DUPLICATE_FIELD_NAME",
          context: { fieldName: field.name },
        });
      }
      fieldNames.add(field.name);
    }

    // Validate policies
    for (const [index, policy] of (schema.policies ?? []).entries()) {
      if (!policy.name) {
        errors.push({
          field: `policies[${index}].name`,
          message: "Policy must have a name",
          code: "MISSING_POLICY_NAME",
        });
      }

      if (!["allow", "deny"].includes(policy.effect)) {
        errors.push({
          field: `policies[${index}].effect`,
          message: "Policy effect must be 'allow' or 'deny'",
          code: "INVALID_POLICY_EFFECT",
        });
      }

      const validActions = ["create", "read", "update", "delete", "*"];
      if (!validActions.includes(policy.action)) {
        errors.push({
          field: `policies[${index}].action`,
          message: `Invalid policy action: ${policy.action}`,
          code: "INVALID_POLICY_ACTION",
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async invalidateCache(entityName: string, version: string): Promise<void> {
    const cacheKey = this.getCacheKey(entityName, version);
    await this.config.cache.del(cacheKey);
  }

  async getCached(
    entityName: string,
    version: string,
  ): Promise<CompiledModel | undefined> {
    if (!this.enableCache) {
      return undefined;
    }

    const cacheKey = this.getCacheKey(entityName, version);
    const cached = await this.config.cache.get(cacheKey);

    if (!cached) {
      return undefined;
    }

    try {
      const cacheData = JSON.parse(cached);

      // Handle both old format (just compiled model) and new format (with policy definitions)
      const compiled = cacheData.compiled || cacheData;
      const policyDefinitions = cacheData.policyDefinitions || [];

      // Restore Date objects
      compiled.compiledAt = new Date(compiled.compiledAt);

      // Restore policy evaluate functions
      for (let i = 0; i < compiled.policies.length; i++) {
        const policy = compiled.policies[i];
        policy.compiledAt = new Date(policy.compiledAt);

        // Find original policy definition to get conditions
        const policyDef = policyDefinitions.find(
          (p: any) => p.name === policy.name,
        );

        // Restore evaluate function with condition support
        policy.evaluate = (ctx: any, record?: any) => {
          // Check if action matches (wildcard * matches all)
          const actionMatches =
            policy.action === "*" || policy.action === ctx.action;

          // Check if resource matches
          const resourceMatches = policy.resource === ctx.resource;

          // If action/resource don't match, policy doesn't apply
          if (!actionMatches || !resourceMatches) {
            return false;
          }

          // Evaluate conditions (AND logic - all must pass)
          if (
            policyDef &&
            policyDef.conditions &&
            policyDef.conditions.length > 0
          ) {
            return policyDef.conditions.every((condition: PolicyCondition) =>
              this.evaluateCondition(condition, ctx, record),
            );
          }

          // No conditions means policy applies if action/resource match
          return true;
        };
      }

      return compiled;
    } catch {
      // Invalid cache data, delete it
      await this.config.cache.del(cacheKey);
      return undefined;
    }
  }

  async precompileAll(): Promise<CompiledModel[]> {
    // Get all entities
    const { data: entities } = await this.registry.listEntities({
      pageSize: 100,
    });

    const compiled: CompiledModel[] = [];

    for (const entity of entities) {
      if (entity.activeVersion) {
        try {
          const model = await this.compile(entity.name, entity.activeVersion);
          compiled.push(model);
        } catch (error) {
          console.error(
            `Failed to precompile ${entity.name}@${entity.activeVersion}:`,
            error,
          );
        }
      }
    }

    return compiled;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Check Redis connectivity
      await this.config.cache.ping();

      return {
        healthy: true,
        message: "META Compiler healthy",
        details: {
          cache: "connected",
          cacheTTL: this.cacheTTL,
          cacheEnabled: this.enableCache,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `META Compiler unhealthy: ${String(error)}`,
        details: {
          cache: "disconnected",
          error: String(error),
        },
      };
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Validate required system fields (Phase 1.2)
   *
   * HARD INVARIANT: Every entity MUST have these system fields:
   * - id (uuid, primary key)
   * - tenant_id (uuid)
   * - realm_id (string/uuid)
   * - created_at, created_by
   * - updated_at, updated_by
   * - deleted_at, deleted_by (soft delete)
   * - version (int, optimistic locking)
   *
   * This ensures:
   * 1. Multi-tenancy isolation
   * 2. Audit trail
   * 3. Soft delete support
   * 4. Optimistic concurrency control
   */
  private validateSystemFields(
    schema: EntitySchema,
    errors: ValidationError[],
  ): void {
    const requiredFields = [
      { name: "id", type: "uuid", primaryKey: true },
      { name: "tenant_id", type: "uuid" },
      { name: "realm_id", type: ["string", "uuid"] },
      { name: "created_at", type: "datetime" },
      { name: "created_by", type: "string" },
      { name: "updated_at", type: "datetime" },
      { name: "updated_by", type: "string" },
      { name: "deleted_at", type: "datetime" },
      { name: "deleted_by", type: "string" },
      { name: "version", type: "number" },
    ];

    for (const required of requiredFields) {
      const field = schema.fields.find((f) => f.name === required.name);

      if (!field) {
        errors.push({
          field: "fields",
          message: `Missing required system field: ${required.name}`,
          code: "MISSING_SYSTEM_FIELD",
          context: {
            systemField: required.name,
            expectedType: Array.isArray(required.type)
              ? required.type.join(" or ")
              : required.type,
          },
        });
        continue;
      }

      // Type check
      const expectedTypes = Array.isArray(required.type)
        ? required.type
        : [required.type];
      if (!expectedTypes.includes(field.type)) {
        errors.push({
          field: `fields[${required.name}]`,
          message: `System field ${required.name} has wrong type: expected ${expectedTypes.join(" or ")}, got ${field.type}`,
          code: "INVALID_SYSTEM_FIELD_TYPE",
          context: {
            systemField: required.name,
            expectedType: expectedTypes.join(" or "),
            actualType: field.type,
          },
        });
      }

      // Primary key check for id field
      // Note: isPrimaryKey is enforced at DDL generation, not schema validation
      if (required.primaryKey && required.name === "id") {
        // Just verify id exists with correct type (already checked above)
        // The primary key constraint is applied during DDL generation
      }
    }
  }

  private async compileAndCache(
    entityName: string,
    version: string,
  ): Promise<CompiledModel> {
    // Phase 9.3: Start performance measurement
    const startTime = performance.now();

    try {
      // Get version from registry
      const entityVersion = await this.registry.getVersion(entityName, version);

      if (!entityVersion) {
        throw new Error(`Entity version not found: ${entityName}@${version}`);
      }

      // Validate schema
      const validation = await this.validate(entityVersion.schema);
      if (!validation.valid) {
        throw new Error(
          `Schema validation failed: ${JSON.stringify(validation.errors)}`,
        );
      }

      // Compile
      const compileStart = performance.now();
      const compiled = this.compileSchema(
        entityName,
        version,
        entityVersion.schema,
        entityVersion.createdBy,
      );
      const compileDuration = performance.now() - compileStart;

      // Phase 9.2: Check for ERROR diagnostics (quality gate)
      if (compiled.diagnostics && this.hasErrors(compiled.diagnostics)) {
        const errors = compiled.diagnostics
          .filter((d) => d.severity === "ERROR")
          .map((d) => d.message);

        // Log compilation failure
        console.error(
          JSON.stringify({
            msg: "compilation_failed",
            entity: entityName,
            version,
            errors,
            duration_ms: compileDuration,
          }),
        );

        throw new Error(
          `Compilation failed with ${errors.length} error(s): ${errors.join("; ")}`,
        );
      }

      // Cache (include original policy definitions for condition evaluation)
      if (this.enableCache) {
        const cacheSetStart = performance.now();
        const cacheKey = this.getCacheKey(entityName, version);
        const cacheData = {
          compiled,
          policyDefinitions: entityVersion.schema.policies || [],
        };
        await this.config.cache.setex(
          cacheKey,
          this.cacheTTL,
          JSON.stringify(cacheData),
        );
        const cacheSetDuration = performance.now() - cacheSetStart;

        // Phase 9.3: Log cache write performance
        console.log(
          JSON.stringify({
            msg: "compilation_cache_set",
            entity: entityName,
            version,
            cache_duration_ms: cacheSetDuration,
          }),
        );
      }

      // Phase 9.3: Log compilation success metrics
      const totalDuration = performance.now() - startTime;
      const warnCount =
        compiled.diagnostics?.filter((d) => d.severity === "WARN").length || 0;
      const infoCount =
        compiled.diagnostics?.filter((d) => d.severity === "INFO").length || 0;

      // Diagnostic code breakdown for observability
      const diagnosticCodes: Record<string, number> = {};
      for (const d of compiled.diagnostics ?? []) {
        diagnosticCodes[d.code] = (diagnosticCodes[d.code] ?? 0) + 1;
      }

      console.log(
        JSON.stringify({
          msg: "compilation_success",
          entity: entityName,
          version,
          input_hash: compiled.inputHash,
          output_hash: compiled.outputHash,
          duration_ms: totalDuration,
          compile_duration_ms: compileDuration,
          field_count: compiled.fields?.length ?? 0,
          diagnostics: {
            errors: 0,
            warnings: warnCount,
            info: infoCount,
            codes: diagnosticCodes,
          },
        }),
      );

      return compiled;
    } catch (error) {
      // Phase 9.3: Log compilation failure metrics
      const totalDuration = performance.now() - startTime;
      console.error(
        JSON.stringify({
          msg: "compilation_error",
          entity: entityName,
          version,
          duration_ms: totalDuration,
          error: String(error),
        }),
      );

      throw error;
    }
  }

  private compileSchema(
    entityName: string,
    version: string,
    schema: EntitySchema,
    compiledBy: string,
  ): CompiledModel {
    // Phase 9.1: Compute input hash (stable hash of all inputs)
    const inputHash = this.computeInputHash(entityName, version, schema);

    // Compile fields
    const compiledFields = schema.fields.map((field) =>
      this.compileField(field),
    );

    // Compile policies
    const compiledPolicies = (schema.policies ?? []).map((policy) =>
      this.compilePolicy(policy),
    );

    // Build query fragments
    const tableName = this.getTableName(entityName);
    const selectFragment = compiledFields.map((f) => f.selectAs).join(", ");
    const fromFragment = `"${tableName}"`;
    const tenantFilterFragment =
      "tenant_id = $tenant_id AND realm_id = $realm_id";

    // Calculate schema hash (legacy, kept for backward compatibility)
    const hash = this.calculateHash(schema);

    // Build indexes list
    const indexes: string[] = [];
    for (const field of schema.fields) {
      if (field.indexed) {
        indexes.push(`idx_${tableName}_${this.toSnakeCase(field.name)}`);
      }
      if (field.unique) {
        indexes.push(`uniq_${tableName}_${this.toSnakeCase(field.name)}`);
      }
    }

    // Phase 9.2: Collect diagnostics
    const diagnostics = this.collectDiagnostics(schema, compiledFields);

    // Build compiled model (without outputHash first)
    const compiledModel: Omit<CompiledModel, "hash"> = {
      entityName,
      version,
      tableName,
      fields: compiledFields,
      policies: compiledPolicies,
      selectFragment,
      fromFragment,
      tenantFilterFragment,
      indexes,
      compiledAt: new Date(),
      compiledBy,
      inputHash,
      diagnostics,
    };

    // Phase 9.1: Compute output hash (hash of compiled output)
    const outputHash = this.computeOutputHash(compiledModel);

    return {
      ...compiledModel,
      hash, // Legacy hash field
      outputHash,
    };
  }

  /**
   * Build a canonical CompiledSnapshot from a CompiledModel + original schema.
   *
   * The snapshot is the immutable boundary between meta-authoring and
   * meta-consuming. All consumers (UI, runtime, search) should read
   * this snapshot rather than raw field rows.
   *
   * @param compiled - The compiled model IR
   * @param schema - Original entity schema (needed for full field resolution)
   * @param tableSchema - DB schema name (default: "public")
   */
  buildSnapshot(
    compiled: CompiledModel,
    schema: EntitySchema,
    tableSchema: string = "public",
  ): CompiledSnapshot {
    // Resolve all fields from the original schema (preserves full metadata)
    const resolvedFields = this.resolveFields(schema);

    // Compute stable content hash of the full snapshot
    const contentPayload = JSON.stringify({
      entityName: compiled.entityName,
      version: compiled.version,
      fields: resolvedFields,
      policies: compiled.policies?.map((p) => ({
        name: p.name,
        effect: p.effect,
        action: p.action,
        resource: p.resource,
        fields: p.fields,
      })),
      entityClass: compiled.entityClass,
      featureFlags: compiled.featureFlags,
    });
    const contentHash = createHash("sha256")
      .update(contentPayload)
      .digest("hex")
      .slice(0, 16);

    return {
      entityName: compiled.entityName,
      version: compiled.version,
      tableName: compiled.tableName,
      tableSchema,
      resolvedFields,
      compiledFields: compiled.fields,
      policies: compiled.policies,
      queryFragments: {
        selectFragment: compiled.selectFragment,
        fromFragment: compiled.fromFragment,
        tenantFilterFragment: compiled.tenantFilterFragment,
      },
      entityClass: compiled.entityClass,
      featureFlags: compiled.featureFlags,
      diagnostics: compiled.diagnostics ?? [],
      contentHash,
      inputHash: compiled.inputHash ?? "",
      compiledAt: compiled.compiledAt.toISOString(),
      compiledBy: compiled.compiledBy,
    };
  }

  private compileField(field: FieldDefinition): CompiledField {
    const columnName = this.toSnakeCase(field.name);
    const selectAs = `"${columnName}" as "${field.name}"`;

    return {
      name: field.name,
      columnName,
      type: field.type,
      required: field.required,
      selectAs,
      indexed: field.indexed,
      unique: field.unique,
      // Include validation constraints
      referenceTo: field.referenceTo,
      onDelete: field.onDelete,
      enumValues: field.enumValues,
      minLength: field.minLength,
      maxLength: field.maxLength,
      pattern: field.pattern,
      min: field.min,
      max: field.max,
      // Validator and transformer can be added here
    };
  }

  // =========================================================================
  // Field Resolution (Enhancement 043 — ResolvedFieldMeta)
  // =========================================================================

  /**
   * Resolve a FieldDefinition into a fully-resolved ResolvedFieldMeta.
   * This is the publish-time compilation contract that runtime + UI consume.
   *
   * Resolution pipeline:
   *   1. Identity & column name
   *   2. Label resolution (explicit > humanized name)
   *   3. Constraints merge (legacy fields + structured constraints)
   *   4. UI type auto-detection (dataType + format → uiType)
   *   5. Visibility/editability defaults
   *   6. Computed/collection wiring pass-through
   *   7. List capabilities pass-through
   */
  resolveField(field: FieldDefinition): ResolvedFieldMeta {
    const columnName = field.isComputed && field.computeMode === "virtual"
      ? null
      : this.toSnakeCase(field.name);

    // ── 1. Label resolution ──
    const label = field.label ?? this.humanize(field.name);

    // ── 2. Constraints merge ──
    const constraints: FieldConstraints = {
      ...(field.constraints ?? {}),
      required: field.constraints?.required ?? field.required,
      nullable: field.constraints?.nullable ?? !field.required,
    };
    // Back-fill legacy fields into constraints if not already present
    if (field.minLength != null && constraints.minLength == null)
      constraints.minLength = field.minLength;
    if (field.maxLength != null && constraints.maxLength == null)
      constraints.maxLength = field.maxLength;
    if (field.min != null && constraints.min == null)
      constraints.min = field.min;
    if (field.max != null && constraints.max == null)
      constraints.max = field.max;
    if (field.pattern != null && constraints.pattern == null)
      constraints.pattern = field.pattern;

    // ── 3. UI type auto-detection ──
    const uiType = field.ui?.type ?? this.autoDetectUiType(field.type, field.format);
    const viewType = field.ui?.viewType;
    const editType = field.ui?.editType;

    // ── 4. Visibility defaults ──
    const visibility: Required<FieldVisibility> = {
      create: field.visibility?.create ?? "visible",
      view: field.visibility?.view ?? "visible",
      edit: field.visibility?.edit ?? "visible",
    };
    // System fields default to hidden in create/edit
    if (field.origin === "system") {
      if (!field.visibility?.create) visibility.create = "hidden";
      if (!field.visibility?.edit) visibility.edit = "hidden";
    }
    // Computed fields are always hidden in create, read-only in edit
    if (field.isComputed) {
      visibility.create = "hidden";
    }

    // ── 5. Editability defaults ──
    const editability: Required<FieldEditability> = {
      create: field.editability?.create ?? "editable",
      edit: field.editability?.edit ?? "editable",
    };
    if (field.isReadOnly) {
      editability.create = "read_only";
      editability.edit = "read_only";
    }
    if (field.isComputed) {
      editability.create = "computed";
      editability.edit = "computed";
    }
    if (field.writeOnce) {
      editability.edit = "read_only";
    }

    // ── 6. Reference/enum config resolution ──
    const lookupConfig: ReferenceConfig | undefined = field.referenceConfig
      ?? (field.referenceTo
        ? { entity: field.referenceTo, relationshipKind: "many-to-one" as const }
        : undefined);

    const enumConfig: EnumConfig | undefined = field.enumConfig
      ?? (field.enumValues
        ? { values: field.enumValues.map((v) => ({ value: v })), source: "static" as const }
        : undefined);

    // ── 7. Validation merge ──
    const validation: Record<string, unknown> | undefined =
      (field.constraints || field.minLength != null || field.maxLength != null ||
        field.min != null || field.max != null || field.pattern != null)
        ? { ...constraints }
        : undefined;

    return {
      name: field.name,
      columnName,
      label,
      description: field.description,

      // Data layer
      dataType: field.type,
      format: field.format,
      unit: field.unit,
      cardinality: field.cardinality ?? "one",
      constraints,
      defaultValue: field.defaultValue,

      // Resolved renderer
      uiType,
      viewType,
      editType,
      uiConfig: field.ui,

      // Visibility & editability
      visibility,
      editability,

      // Validation
      validation,

      // Lookup / reference wiring
      lookupConfig,
      enumConfig,

      // Collection wiring
      childEntityName: field.childEntityName,
      childFkField: field.childFkField,
      collectionBehavior: field.collectionBehavior,

      // Computed wiring
      isComputed: field.isComputed ?? false,
      computeMode: field.computeMode,
      computeExpr: field.computeExpr,

      // List capabilities — derived from type defaults + system restrictions + field overrides
      isSearchable: field.indexed ?? false,
      isFilterable: false,
      ...(() => {
        const caps = resolveCapabilityDefaults(field.type, {
          isComputed: field.isComputed,
          origin: field.origin,
          isSortable: field.isSortable,
          isGroupable: field.isGroupable,
          isAggregatable: field.isAggregatable,
        });
        return {
          isSortable: caps.sortable,
          isGroupable: caps.groupable,
          isAggregatable: caps.aggregatable,
        };
      })(),

      // Behavior flags
      isRequired: field.required,
      isUnique: field.unique ?? false,
      isReadOnly: field.isReadOnly ?? false,
      isDeprecated: field.isDeprecated ?? false,
      writeOnce: field.writeOnce ?? false,
      isActive: true,
      sortOrder: 0,
    };
  }

  /**
   * Batch-resolve all fields in a schema to ResolvedFieldMeta[].
   * Includes sort order assignment.
   */
  resolveFields(schema: EntitySchema): ResolvedFieldMeta[] {
    return schema.fields.map((field, index) => {
      const resolved = this.resolveField(field);
      resolved.sortOrder = index;
      return resolved;
    });
  }

  /**
   * Auto-detect UI type from data type + semantic format.
   * This is the single source of truth for the default data-type → UI-component mapping.
   */
  private autoDetectUiType(dataType: FieldType, format?: SemanticFormat): string {
    // Format-specific overrides
    if (format) {
      switch (format) {
        case "email": return "email-input";
        case "phone": return "phone-input";
        case "url": return "url-input";
        case "money": return "money-input";
        case "percent": return "percent-input";
        case "password": return "password-input";
        case "color": return "color-picker";
        case "markdown": return "markdown-editor";
        case "html": return "rich-text-editor";
        case "country": return "country-select";
        case "timezone": return "timezone-select";
        case "slug": return "slug-input";
        case "ip_address": return "text";
      }
    }

    // Data type defaults
    switch (dataType) {
      case "string": return "text";
      case "text": return "textarea";
      case "rich_text": return "rich-text-editor";
      case "integer":
      case "number":
      case "decimal": return "number";
      case "boolean": return "toggle";
      case "date": return "datepicker";
      case "datetime": return "datetimepicker";
      case "reference": return "reference-picker";
      case "enum": return "select";
      case "json": return "json-editor";
      case "uuid": return "text";
      default: return "text";
    }
  }

  /**
   * Humanize a camelCase field name into a display label.
   * "invoiceLineTotal" → "Invoice Line Total"
   */
  private humanize(name: string): string {
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  }

  private compilePolicy(policy: PolicyDefinition): CompiledPolicy {
    const hash = this.calculateHash(policy);

    return {
      name: policy.name,
      effect: policy.effect,
      action: policy.action,
      resource: policy.resource,
      fields: policy.fields, // Include field-level access control
      // Evaluate if this policy matches the given action/resource and conditions
      evaluate: (ctx: any, record?: any) => {
        // This returns whether the policy MATCHES, not whether it allows
        // The policy gate will interpret effect based on match

        // Check if action matches (wildcard * matches all)
        const actionMatches =
          policy.action === "*" || policy.action === ctx.action;

        // Check if resource matches
        const resourceMatches = policy.resource === ctx.resource;

        // If action/resource don't match, policy doesn't apply
        if (!actionMatches || !resourceMatches) {
          return false;
        }

        // Evaluate conditions (AND logic - all must pass)
        if (policy.conditions && policy.conditions.length > 0) {
          return policy.conditions.every((condition) =>
            this.evaluateCondition(condition, ctx, record),
          );
        }

        // No conditions means policy applies if action/resource match
        return true;
      },
      priority: policy.priority ?? 0,
      compiledAt: new Date(),
      hash,
    };
  }

  /**
   * Evaluate a single policy condition
   * Supports extraction from ctx (e.g., "ctx.roles") or record (e.g., "record.status")
   */
  private evaluateCondition(
    condition: PolicyCondition,
    ctx: any,
    record?: any,
  ): boolean {
    // Extract the actual value from the field path
    const actualValue = this.extractValue(condition.field, ctx, record);
    const conditionValue = condition.value as any;

    // Apply the operator
    switch (condition.operator) {
      case "eq":
        return actualValue === conditionValue;

      case "ne":
        return actualValue !== conditionValue;

      case "in":
        if (!Array.isArray(conditionValue)) return false;
        // For array actual values (like roles), check if ANY role is in the allowed list
        if (Array.isArray(actualValue)) {
          return actualValue.some((v) => conditionValue.includes(v));
        }
        // For single values, check if value is in the array
        return conditionValue.includes(actualValue);

      case "not_in":
        if (!Array.isArray(conditionValue)) return false;
        if (Array.isArray(actualValue)) {
          return !actualValue.some((v) => conditionValue.includes(v));
        }
        return !conditionValue.includes(actualValue);

      case "gt":
        return actualValue > conditionValue;

      case "gte":
        return actualValue >= conditionValue;

      case "lt":
        return actualValue < conditionValue;

      case "lte":
        return actualValue <= conditionValue;

      case "contains":
        if (
          typeof actualValue === "string" &&
          typeof conditionValue === "string"
        ) {
          return actualValue.includes(conditionValue);
        }
        if (Array.isArray(actualValue)) {
          return actualValue.includes(conditionValue);
        }
        return false;

      case "starts_with":
        if (
          typeof actualValue === "string" &&
          typeof conditionValue === "string"
        ) {
          return actualValue.startsWith(conditionValue);
        }
        return false;

      case "ends_with":
        if (
          typeof actualValue === "string" &&
          typeof conditionValue === "string"
        ) {
          return actualValue.endsWith(conditionValue);
        }
        return false;

      default:
        // Unknown operator - fail safe (deny)
        return false;
    }
  }

  /**
   * Extract value from a field path like "ctx.roles" or "record.status"
   */
  private extractValue(field: string, ctx: any, record?: any): any {
    // Split field path by dots
    const parts = field.split(".");

    // Determine the root object
    let value: any;
    if (parts[0] === "ctx") {
      value = ctx;
      parts.shift(); // Remove "ctx" prefix
    } else if (parts[0] === "record") {
      value = record;
      parts.shift(); // Remove "record" prefix
    } else {
      // No prefix - assume ctx
      value = ctx;
    }

    // Traverse the path
    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  private getTableName(entityName: string): string {
    // Convert entity name to snake_case and prefix with "ent_"
    return `ent_${this.toSnakeCase(entityName)}`;
  }

  private toSnakeCase(str: string): string {
    return str
      .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
      .replace(/^_/, ""); // Remove leading underscore
  }

  private calculateHash(obj: unknown): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(obj));
    return hash.digest("hex").substring(0, 16);
  }

  private getCacheKey(entityName: string, version: string): string {
    return `meta:compiled:${entityName}:${version}`;
  }

  // =========================================================================
  // Phase 9.1: Canonical Compilation Identity
  // =========================================================================

  /**
   * Compute stable input hash for compilation
   * Includes: entity name, version, fields, policies, relations, indexes
   * Uses canonical JSON ordering for deterministic hashing
   */
  private computeInputHash(
    entityName: string,
    version: string,
    schema: EntitySchema,
  ): string {
    const inputs = {
      entityName,
      version,
      fields: schema.fields || [],
      policies: schema.policies || [],
      metadata: schema.metadata || {},
      // Future: relations, indexes, overlays
    };

    // Canonicalize and hash
    const canonical = this.canonicalizeJSON(inputs);
    const hash = createHash("sha256");
    hash.update(canonical);
    return hash.digest("hex");
  }

  /**
   * Compute output hash for compiled model
   * Hash of the compiled JSON (excluding hash field itself)
   */
  private computeOutputHash(compiled: Omit<CompiledModel, "hash">): string {
    const canonical = this.canonicalizeJSON(compiled);
    const hash = createHash("sha256");
    hash.update(canonical);
    return hash.digest("hex");
  }

  /**
   * Canonicalize JSON for stable hashing
   * Ensures stable key ordering and consistent formatting
   */
  private canonicalizeJSON(obj: unknown): string {
    if (obj === null || obj === undefined) {
      return JSON.stringify(obj);
    }

    if (typeof obj !== "object") {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return `[${obj.map((item) => this.canonicalizeJSON(item)).join(",")}]`;
    }

    // Sort object keys alphabetically
    const sorted = Object.keys(obj)
      .sort()
      .map((key) => {
        const value = (obj as Record<string, unknown>)[key];
        return `${JSON.stringify(key)}:${this.canonicalizeJSON(value)}`;
      })
      .join(",");

    return `{${sorted}}`;
  }

  // =========================================================================
  // Phase 9.2: Compilation Diagnostics
  // =========================================================================

  /**
   * Collect diagnostics during schema compilation
   * Returns list of ERROR, WARN, and INFO diagnostics
   */
  private collectDiagnostics(
    schema: EntitySchema,
    _compiledFields: CompiledField[],
  ): CompileDiagnostic[] {
    const diagnostics: CompileDiagnostic[] = [];

    // Check fields
    for (const field of schema.fields || []) {
      // ERROR: Unknown data type
      const validTypes = [
        "string",
        "text",
        "integer",
        "number",
        "decimal",
        "boolean",
        "date",
        "datetime",
        "reference",
        "enum",
        "json",
        "uuid",
        "rich_text",
      ];
      if (!validTypes.includes(field.type)) {
        diagnostics.push(
          this.createDiagnostic(
            "ERROR",
            "unknown_data_type",
            `Unknown data type '${field.type}' for field '${field.name}'`,
            field.name,
          ),
        );
      }

      // ERROR: Enum without values
      if (
        field.type === "enum" &&
        (!field.enumValues || field.enumValues.length === 0)
      ) {
        diagnostics.push(
          this.createDiagnostic(
            "ERROR",
            "enum_no_values",
            `Enum field '${field.name}' has no enum values defined`,
            field.name,
          ),
        );
      }

      // ERROR: Reference without referenceTo
      if (field.type === "reference" && !field.referenceTo) {
        diagnostics.push(
          this.createDiagnostic(
            "ERROR",
            "reference_no_target",
            `Reference field '${field.name}' missing referenceTo`,
            field.name,
          ),
        );
      }

      // WARN: Required field without default value (informational)
      if (field.required && !field.defaultValue) {
        diagnostics.push(
          this.createDiagnostic(
            "INFO",
            "required_no_default",
            `Required field '${field.name}' has no default value`,
            field.name,
          ),
        );
      }

      // WARN: Field marked for indexing but not actually indexed (future)
      // This would require checking against actual database indexes
      // For now, just log intent
      if (field.indexed) {
        diagnostics.push(
          this.createDiagnostic(
            "INFO",
            "field_indexed",
            `Field '${field.name}' will be indexed`,
            field.name,
          ),
        );
      }

      // ERROR: Computed field without compute wiring
      if (field.isComputed && (!field.computeMode || !field.computeExpr)) {
        diagnostics.push(
          this.createDiagnostic(
            "ERROR",
            "computed_missing_wiring",
            `Computed field '${field.name}' missing computeMode or computeExpr`,
            field.name,
          ),
        );
      }

      // ERROR: Non-computed field with stale compute wiring
      if (!field.isComputed && (field.computeMode || field.computeExpr)) {
        diagnostics.push(
          this.createDiagnostic(
            "ERROR",
            "non_computed_has_wiring",
            `Non-computed field '${field.name}' has stale computeMode/computeExpr`,
            field.name,
          ),
        );
      }

      // ERROR: cardinality=many without child entity wiring
      if (field.cardinality === "many" && (!field.childEntityName || !field.childFkField)) {
        diagnostics.push(
          this.createDiagnostic(
            "ERROR",
            "many_missing_wiring",
            `Collection field '${field.name}' (cardinality=many) missing childEntityName or childFkField`,
            field.name,
          ),
        );
      }

      // WARN: Deprecated field
      if (field.isDeprecated) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "field_deprecated",
            `Field '${field.name}' is deprecated`,
            field.name,
          ),
        );
      }

      // WARN: Reference field without referenceConfig or referenceTo
      if (field.type === "reference" && !field.referenceConfig && !field.referenceTo) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "reference_no_config",
            `Reference field '${field.name}' has no referenceConfig or referenceTo`,
            field.name,
          ),
        );
      }

      // WARN: Enum field without enumConfig or enumValues
      if (field.type === "enum" && !field.enumConfig && (!field.enumValues || field.enumValues.length === 0)) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "enum_no_config",
            `Enum field '${field.name}' has no enumConfig or enumValues`,
            field.name,
          ),
        );
      }

      // WARN: Enum config with duplicate values
      if (field.enumConfig?.values && Array.isArray(field.enumConfig.values)) {
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const entry of field.enumConfig.values) {
          const val = typeof entry === "string" ? entry : (entry as Record<string, unknown>)?.value;
          if (typeof val === "string") {
            if (seen.has(val)) dupes.push(val);
            seen.add(val);
          }
        }
        if (dupes.length > 0) {
          diagnostics.push(
            this.createDiagnostic(
              "ERROR",
              "enum_duplicate_values",
              `Enum field '${field.name}' has duplicate values: [${dupes.join(", ")}]`,
              field.name,
            ),
          );
        }
      }

      // WARN: Empty enum values in enumConfig
      if (field.enumConfig?.values && Array.isArray(field.enumConfig.values)) {
        const hasEmpty = field.enumConfig.values.some((entry: unknown) => {
          const val = typeof entry === "string" ? entry : (entry as Record<string, unknown>)?.value;
          return val === "" || val === null || val === undefined;
        });
        if (hasEmpty) {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "enum_empty_value",
              `Enum field '${field.name}' has empty/null values in enumConfig`,
              field.name,
            ),
          );
        }
      }
    }

    // Check policies
    for (const policy of schema.policies || []) {
      // WARN: Policy with no conditions (always applies)
      if (!policy.conditions || policy.conditions.length === 0) {
        diagnostics.push(
          this.createDiagnostic(
            "INFO",
            "policy_no_conditions",
            `Policy '${policy.name}' has no conditions (always applies)`,
            undefined,
            { policy: policy.name },
          ),
        );
      }

      // ERROR: Field-level policy references non-existent field
      if (
        policy.fields &&
        policy.fields.length > 0 &&
        !policy.fields.includes("*")
      ) {
        for (const fieldName of policy.fields) {
          const fieldExists = schema.fields.some((f) => f.name === fieldName);
          if (!fieldExists) {
            diagnostics.push(
              this.createDiagnostic(
                "ERROR",
                "policy_unknown_field",
                `Policy '${policy.name}' references unknown field '${fieldName}'`,
                undefined,
                { policy: policy.name, field: fieldName },
              ),
            );
          }
        }
      }
    }

    // ── Legacy/new field overlap diagnostics ──
    for (const field of schema.fields || []) {
      // WARN: is_required conflicts with constraints.required / constraints.nullable
      if (field.constraints) {
        const c = field.constraints;
        if (field.required && c.nullable === true) {
          diagnostics.push(
            this.createDiagnostic(
              "ERROR",
              "required_nullable_conflict",
              `Field '${field.name}': is_required=true but constraints.nullable=true — contradictory`,
              field.name,
            ),
          );
        }
        if (c.required !== undefined && field.required !== c.required) {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "required_constraints_mismatch",
              `Field '${field.name}': required=${field.required} but constraints.required=${c.required} — prefer constraints as canonical source`,
              field.name,
            ),
          );
        }
      }

      // WARN: Legacy validation fields alongside constraints
      const hasLegacyValidation = field.minLength !== undefined || field.maxLength !== undefined
        || field.pattern !== undefined || field.min !== undefined || field.max !== undefined;
      if (hasLegacyValidation && field.constraints) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "legacy_validation_overlap",
            `Field '${field.name}' has both legacy validation fields (min/max/pattern/minLength/maxLength) and constraints — prefer constraints as canonical source`,
            field.name,
          ),
        );
      }

      // WARN: Legacy enum values alongside enumConfig
      if (field.enumValues && field.enumValues.length > 0 && field.enumConfig) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "legacy_enum_overlap",
            `Field '${field.name}' has both legacy enumValues and enumConfig — prefer enumConfig`,
            field.name,
          ),
        );
      }

      // WARN: Legacy referenceTo alongside referenceConfig
      if (field.referenceTo && field.referenceConfig) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "legacy_reference_overlap",
            `Field '${field.name}' has both legacy referenceTo and referenceConfig — prefer referenceConfig.entity`,
            field.name,
          ),
        );
      }

      // WARN: Legacy UI hints alongside structured ui
      const hasLegacyUi = field.placeholder !== undefined || field.helpText !== undefined;
      if (hasLegacyUi && field.ui) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "legacy_ui_overlap",
            `Field '${field.name}' has both legacy UI hints (placeholder/helpText) and ui — prefer ui`,
            field.name,
          ),
        );
      }

      // ── Deprecation warnings: legacy properties without canonical replacement ──

      // WARN: Legacy validation fields present without structured constraints
      const hasLegacyConstraintFields = field.minLength !== undefined || field.maxLength !== undefined
        || field.pattern !== undefined || field.min !== undefined || field.max !== undefined;
      if (hasLegacyConstraintFields && !field.constraints) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "deprecated_validation_no_constraints",
            `Field '${field.name}' uses legacy validation fields (min/max/pattern/minLength/maxLength) without structured 'constraints'. Migrate to constraints for type-safe enforcement.`,
            field.name,
          ),
        );
      }

      // WARN: Legacy referenceTo without referenceConfig
      if (field.referenceTo && !field.referenceConfig) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "deprecated_reference_to",
            `Field '${field.name}' uses deprecated 'referenceTo' without 'referenceConfig'. Migrate FK wiring to referenceConfig + lookupProfile.`,
            field.name,
          ),
        );
      }

      // WARN: Legacy placeholder/helpText without ui hint
      if ((field.placeholder || field.helpText) && !field.ui) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "deprecated_ui_fields",
            `Field '${field.name}' uses legacy placeholder/helpText without structured 'ui' hint. Migrate to ui.placeholder / ui.helpText.`,
            field.name,
          ),
        );
      }

      // WARN: required=true without constraints.required (should be consistent)
      if (field.required && field.constraints && field.constraints.required === undefined) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "requiredness_not_in_constraints",
            `Field '${field.name}' has required=true but constraints.required is not set. Add required:true to constraints for consistency.`,
            field.name,
          ),
        );
      }

      // WARN: format='money' without moneyConfig
      if (field.format === "money" && !field.moneyConfig) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "money_format_no_config",
            `Field '${field.name}' has format='money' but no moneyConfig — currency and rounding behavior undefined`,
            field.name,
          ),
        );
      }

      // WARN: is_sortable on json/rich_text (no natural ordering)
      if (field.isSortable && (field.type === "json" || field.type === "rich_text")) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "sortable_unsupported_type",
            `Field '${field.name}' has isSortable=true but type='${field.type}' has no natural sort order`,
            field.name,
          ),
        );
      }

      // WARN: is_aggregatable on non-numeric/unsupported types
      if (field.isAggregatable && ["json", "rich_text", "boolean"].includes(field.type)) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "aggregatable_unsupported_type",
            `Field '${field.name}' has isAggregatable=true but type='${field.type}' does not support aggregation`,
            field.name,
          ),
        );
      }

      // ── Relationship wiring consistency ──

      // ERROR: cardinality=many + relationshipKind mismatch
      if (field.cardinality === "many" && field.referenceConfig) {
        const rc = field.referenceConfig;
        if (rc.relationshipKind && rc.relationshipKind !== "one-to-many" && rc.relationshipKind !== "many-to-many") {
          diagnostics.push(
            this.createDiagnostic(
              "ERROR",
              "cardinality_relationship_mismatch",
              `Field '${field.name}': cardinality=many but referenceConfig.relationshipKind='${rc.relationshipKind}' — expected one-to-many or many-to-many`,
              field.name,
            ),
          );
        }
      }

      // WARN: child_entity_name set but referenceConfig.entity points elsewhere
      if (field.childEntityName && field.referenceConfig?.entity) {
        if (field.childEntityName !== field.referenceConfig.entity) {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "child_entity_reference_mismatch",
              `Field '${field.name}': childEntityName='${field.childEntityName}' but referenceConfig.entity='${field.referenceConfig.entity}' — potential inconsistency`,
              field.name,
            ),
          );
        }
      }

      // WARN: cardinality=one but has collection_behavior
      if (field.cardinality !== "many" && field.collectionBehavior) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "scalar_with_collection_behavior",
            `Field '${field.name}' has cardinality='one' but collectionBehavior is set — collectionBehavior only applies to many-cardinality fields`,
            field.name,
          ),
        );
      }

      // ── Collection semantic consistency checks (Recommendation 14) ──
      if (field.cardinality === "many" && field.collectionBehavior) {
        const cb = field.collectionBehavior;

        // WARN: ownership='owned' + deleteMode='detach' is contradictory
        if (cb.ownership === "owned" && cb.deleteMode === "detach") {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "collection_owned_detach",
              `Field '${field.name}': ownership='owned' with deleteMode='detach' — owned children should cascade or restrict, not detach`,
              field.name,
            ),
          );
        }

        // WARN: persistenceMode='reference_only' with owned children is suspicious
        if (cb.ownership === "owned" && cb.persistenceMode === "reference_only") {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "collection_owned_reference_only",
              `Field '${field.name}': ownership='owned' with persistenceMode='reference_only' — owned children are typically managed inline`,
              field.name,
            ),
          );
        }

        // WARN: editorStyle='tags' only valid for simple linked references
        if (cb.editorStyle === "tags" && cb.ownership === "owned") {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "collection_tags_owned",
              `Field '${field.name}': editorStyle='tags' is designed for simple linked references, not owned children`,
              field.name,
            ),
          );
        }

        // ERROR: minItems > maxItems
        if (cb.minItems != null && cb.maxItems != null && cb.minItems > cb.maxItems) {
          diagnostics.push(
            this.createDiagnostic(
              "ERROR",
              "collection_min_exceeds_max",
              `Field '${field.name}': minItems (${cb.minItems}) exceeds maxItems (${cb.maxItems})`,
              field.name,
            ),
          );
        }

        // WARN: ordering=true without orderField
        if (cb.ordering && !cb.orderField) {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "collection_ordering_no_field",
              `Field '${field.name}': ordering=true but no orderField specified — will default to 'sort_order' which may not exist on the child entity`,
              field.name,
            ),
          );
        }

        // WARN: allowDuplicates on owned children makes no sense
        if (cb.ownership === "owned" && cb.allowDuplicates) {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "collection_owned_duplicates",
              `Field '${field.name}': allowDuplicates=true on ownership='owned' — owned children are unique by identity`,
              field.name,
            ),
          );
        }
      }

      // WARN: lookup_profile.orderBy might not be indexed
      if (field.lookupProfile) {
        const lp = field.lookupProfile;
        if (lp.orderBy) {
          diagnostics.push(
            this.createDiagnostic(
              "INFO",
              "lookup_orderby_index_check",
              `Field '${field.name}': lookupProfile.orderBy='${lp.orderBy}' — ensure this column is indexed on the target entity for performance`,
              field.name,
            ),
          );
        }
      }
    }

    // ── Lookup system diagnostics (044) ──
    const fieldNames = new Set((schema.fields || []).map((f) => f.name));

    for (const field of schema.fields || []) {
      if (field.type !== "reference") continue;

      // WARN: Reference field with no search fields configured
      const refConfig = field.referenceConfig as Record<string, unknown> | undefined;
      const lookupProfile = field.lookupProfile as Record<string, unknown> | undefined;
      const hasSearchFields =
        (lookupProfile?.searchFields && Array.isArray(lookupProfile.searchFields) && (lookupProfile.searchFields as unknown[]).length > 0) ||
        (refConfig?.searchFields && Array.isArray(refConfig.searchFields) && (refConfig.searchFields as unknown[]).length > 0);

      if (!hasSearchFields) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "reference_missing_search_fields",
            `Reference field '${field.name}' has no searchFields defined in lookupProfile or referenceConfig`,
            field.name,
          ),
        );
      }

      // ERROR: Display template references unknown fields (basic check)
      const displayTemplate = (lookupProfile?.displayTemplate as string | undefined);
      if (displayTemplate) {
        const templateTokens = displayTemplate.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) ?? [];
        for (const token of templateTokens) {
          const tokenField = token.replace(/\{\{|\}\}/g, "");
          // Note: we can only validate against the current entity's fields here,
          // not the target entity's fields (that requires registry lookup)
          if (field.referenceTo && !fieldNames.has(tokenField)) {
            diagnostics.push(
              this.createDiagnostic(
                "INFO",
                "reference_display_template_token",
                `Display template for '${field.name}' references '${tokenField}' — ensure it exists on target entity '${field.referenceTo}'`,
                field.name,
                { template: displayTemplate, token: tokenField },
              ),
            );
          }
        }
      }

      // WARN: allowCreateInline without explicit security consideration
      if (refConfig?.allowCreateInline === true) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "reference_allow_create_inline_without_permission",
            `Reference field '${field.name}' allows inline creation — ensure target entity '${field.referenceTo}' has appropriate create permissions`,
            field.name,
            { targetEntity: field.referenceTo },
          ),
        );
      }
    }

    // ── Computed field dependency governance ──
    this.validateComputeDependencyGraph(schema, fieldNames, diagnostics);

    return diagnostics;
  }

  /**
   * Validate computed field dependency graph.
   * - Builds DAG from dependsOn across all computed fields
   * - Topological sort to detect cycles
   * - Validates all references resolve to real fields
   * - Validates formula expressions match declared dependsOn
   * - Validates system compute functions are in allowlist
   * - Checks materialized governance completeness
   */
  private validateComputeDependencyGraph(
    schema: EntitySchema,
    fieldNames: Set<string>,
    diagnostics: CompileDiagnostic[],
  ): void {
    const computedFields = (schema.fields || []).filter(
      (f) => f.isComputed && f.computeExpr,
    );
    if (computedFields.length === 0) return;

    // --- Per-field validation ---
    for (const field of computedFields) {
      const expr = field.computeExpr!;

      // Validate dependsOn references exist
      if (expr.dependsOn) {
        for (const dep of expr.dependsOn) {
          if (!fieldNames.has(dep)) {
            diagnostics.push(
              this.createDiagnostic(
                "ERROR",
                "computed_unknown_dependency",
                `Computed field '${field.name}' depends on unknown field '${dep}'`,
                field.name,
                { dependency: dep },
              ),
            );
          }
        }
      }

      // Formula: validate expr references match dependsOn
      if (expr.type === "formula") {
        const referencedFields = extractFormulaFieldRefs(expr.expr);
        const declaredDeps = new Set(expr.dependsOn ?? []);
        for (const ref of referencedFields) {
          if (!declaredDeps.has(ref)) {
            diagnostics.push(
              this.createDiagnostic(
                "ERROR",
                "computed_depends_on_incomplete",
                `Formula field '${field.name}' references '${ref}' in expr but it is not listed in dependsOn`,
                field.name,
                { missingDep: ref, expr: expr.expr },
              ),
            );
          }
        }
      }

      // System: validate expr is in allowlist
      if (expr.type === "system") {
        if (!SYSTEM_COMPUTE_FUNCTIONS.includes(expr.expr as any)) {
          diagnostics.push(
            this.createDiagnostic(
              "ERROR",
              "computed_unknown_system_function",
              `System compute field '${field.name}' uses unknown function '${expr.expr}'. Allowed: ${SYSTEM_COMPUTE_FUNCTIONS.join(", ")}`,
              field.name,
              { function: expr.expr },
            ),
          );
        }
      }

      // Aggregate: validate aggregateOf is present
      if (expr.type === "aggregate" && (!expr.aggregateOf || !expr.aggregateOp)) {
        diagnostics.push(
          this.createDiagnostic(
            "ERROR",
            "computed_aggregate_incomplete",
            `Aggregate field '${field.name}' missing aggregateOf or aggregateOp`,
            field.name,
          ),
        );
      }

      // Materialized governance
      if (field.computeMode === "materialized") {
        if (!expr.recomputeTrigger) {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "computed_materialized_no_trigger",
              `Materialized field '${field.name}' has no recomputeTrigger — value may become stale with no recompute strategy`,
              field.name,
            ),
          );
        }
        if (expr.recomputeTrigger === "on_dependency_change" && expr.stalePolicy === "recompute_sync" && expr.type === "aggregate") {
          diagnostics.push(
            this.createDiagnostic(
              "WARN",
              "computed_sync_recompute_perf",
              `Materialized aggregate field '${field.name}' uses recompute_sync — this is expensive as it runs within the write transaction`,
              field.name,
            ),
          );
        }
      }
    }

    // --- Dependency graph cycle detection (topological sort) ---
    const adjacency = new Map<string, string[]>();
    const computedFieldNames = new Set<string>();

    for (const field of computedFields) {
      computedFieldNames.add(field.name);
      const deps = (field.computeExpr!.dependsOn ?? []).filter((d) =>
        computedFields.some((cf) => cf.name === d),
      );
      adjacency.set(field.name, deps);
    }

    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    for (const name of computedFieldNames) {
      inDegree.set(name, 0);
    }
    for (const [, deps] of adjacency) {
      for (const dep of deps) {
        if (inDegree.has(dep)) {
          inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const dep of adjacency.get(current) ?? []) {
        if (inDegree.has(dep)) {
          const newDegree = (inDegree.get(dep) ?? 1) - 1;
          inDegree.set(dep, newDegree);
          if (newDegree === 0) queue.push(dep);
        }
      }
    }

    if (sorted.length < computedFieldNames.size) {
      const cycleFields = [...computedFieldNames].filter(
        (n) => !sorted.includes(n),
      );
      diagnostics.push(
        this.createDiagnostic(
          "ERROR",
          "computed_circular_dependency",
          `Circular dependency detected among computed fields: ${cycleFields.join(" → ")}`,
          cycleFields[0],
          { involvedFields: cycleFields },
        ),
      );
    }

    // Warn on deep dependency chains (> 5 levels)
    const MAX_DEPTH = 5;
    const depthCache = new Map<string, number>();
    const getDepth = (name: string, visited: Set<string>): number => {
      if (depthCache.has(name)) return depthCache.get(name)!;
      if (visited.has(name)) return 0; // cycle, already reported
      visited.add(name);
      const deps = adjacency.get(name) ?? [];
      const depth = deps.length === 0
        ? 0
        : 1 + Math.max(...deps.map((d) => getDepth(d, visited)));
      depthCache.set(name, depth);
      return depth;
    };
    for (const name of computedFieldNames) {
      const depth = getDepth(name, new Set());
      if (depth > MAX_DEPTH) {
        diagnostics.push(
          this.createDiagnostic(
            "WARN",
            "computed_deep_chain",
            `Computed field '${name}' has dependency chain depth ${depth} (threshold: ${MAX_DEPTH})`,
            name,
            { depth, threshold: MAX_DEPTH },
          ),
        );
      }
    }
  }

  /**
   * Create a diagnostic message
   */
  private createDiagnostic(
    severity: DiagnosticSeverity,
    code: string,
    message: string,
    field?: string,
    context?: Record<string, unknown>,
  ): CompileDiagnostic {
    return {
      severity,
      code,
      message,
      field,
      context,
    };
  }

  /**
   * Check if diagnostics contain any errors
   */
  private hasErrors(diagnostics: CompileDiagnostic[]): boolean {
    return diagnostics.some((d) => d.severity === "ERROR");
  }

  // =========================================================================
  // Overlay System (Phase 10)
  // =========================================================================

  /**
   * Compile entity version with overlays applied
   * Phase 10.1: Apply ordered overlay set to base entity version
   *
   * @param entityName - Entity name
   * @param version - Entity version
   * @param overlaySet - Ordered array of overlay IDs to apply (published only)
   * @returns Compiled model with overlays applied
   */
  async compileWithOverlays(
    entityName: string,
    version: string,
    overlaySet: OverlaySet,
  ): Promise<CompiledModelWithOverlays> {
    // 1. Get base entity version
    const entityVersion = await this.registry.getVersion(entityName, version);
    if (!entityVersion) {
      throw new Error(`Entity version not found: ${entityName}@${version}`);
    }

    // 2. Load all overlay changes (ordered by overlay ID position in set, then by sort_order)
    const allChanges: OverlayChange[] = [];

    // TODO: Load overlay changes from database
    // For Phase 10.1 MVP, we'll need to add a method to registry to load overlays
    // For now, this is a placeholder structure
    // const overlays = await this.registry.getOverlays(overlaySet);
    // for (const overlay of overlays) {
    //   if (overlay.status === 'published') {
    //     allChanges.push(...overlay.changes.sort((a, b) => a.sortOrder - b.sortOrder));
    //   }
    // }

    // 3. Apply overlays to base schema
    const modifiedSchema = this.applyOverlays(entityVersion.schema, allChanges);

    // 4. Compile the modified schema
    const compiled = this.compileSchema(
      entityName,
      version,
      modifiedSchema,
      entityVersion.createdBy,
    );

    // 5. Compute unique hash for this overlay combination
    const overlaySetHash = this.computeOverlaySetHash(
      overlaySet,
      compiled.outputHash || "",
    );

    return {
      model: compiled,
      overlaySet,
      compiledHash: overlaySetHash,
      entityVersionId: entityVersion.id,
      generatedAt: new Date(),
    };
  }

  /**
   * Apply overlay changes to base schema
   * Changes are applied in order with conflict resolution
   *
   * @param baseSchema - Base entity schema
   * @param changes - Ordered array of overlay changes
   * @returns Modified schema with overlays applied
   */
  private applyOverlays(
    baseSchema: EntitySchema,
    changes: OverlayChange[],
  ): EntitySchema {
    // Deep clone base schema to avoid mutations
    const modifiedSchema: EntitySchema = {
      fields: [...baseSchema.fields],
      policies: baseSchema.policies ? [...baseSchema.policies] : [],
      metadata: baseSchema.metadata ? { ...baseSchema.metadata } : {},
    };

    // Apply changes in order
    for (const change of changes) {
      switch (change.changeKind) {
        case "addField":
          this.applyAddField(modifiedSchema, change);
          break;
        case "modifyField":
          this.applyModifyField(modifiedSchema, change);
          break;
        case "removeField":
          this.applyRemoveField(modifiedSchema, change);
          break;
        case "tweakPolicy":
          this.applyTweakPolicy(modifiedSchema, change);
          break;
        default:
          console.warn(
            JSON.stringify({
              msg: "unsupported_overlay_change",
              change_kind: change.changeKind,
              overlay_id: change.overlayId,
            }),
          );
      }
    }

    return modifiedSchema;
  }

  /**
   * Apply add_field change
   * Adds a new field to the schema
   */
  private applyAddField(schema: EntitySchema, change: OverlayChange): void {
    const fieldDef = change.changeJson as FieldDefinition;
    const existingIndex = schema.fields.findIndex(
      (f) => f.name === fieldDef.name,
    );

    if (existingIndex !== -1) {
      // Field already exists - handle conflict
      switch (change.conflictMode) {
        case "fail":
          throw new Error(
            `Overlay conflict: Field '${fieldDef.name}' already exists (overlay: ${change.overlayId}, mode: fail)`,
          );
        case "overwrite":
          schema.fields[existingIndex] = fieldDef;
          console.log(
            JSON.stringify({
              msg: "overlay_field_overwritten",
              field: fieldDef.name,
              overlay_id: change.overlayId,
            }),
          );
          break;
        case "merge":
          // Deep merge field definition
          schema.fields[existingIndex] = {
            ...schema.fields[existingIndex],
            ...fieldDef,
          };
          console.log(
            JSON.stringify({
              msg: "overlay_field_merged",
              field: fieldDef.name,
              overlay_id: change.overlayId,
            }),
          );
          break;
      }
    } else {
      // Field doesn't exist - add it
      schema.fields.push(fieldDef);
      console.log(
        JSON.stringify({
          msg: "overlay_field_added",
          field: fieldDef.name,
          overlay_id: change.overlayId,
        }),
      );
    }
  }

  /**
   * Apply modify_field change
   * Modifies an existing field in the schema
   */
  private applyModifyField(schema: EntitySchema, change: OverlayChange): void {
    const fieldName = change.changeJson.name as string;
    const updates = change.changeJson;
    const existingIndex = schema.fields.findIndex((f) => f.name === fieldName);

    if (existingIndex === -1) {
      // Field doesn't exist - handle conflict
      switch (change.conflictMode) {
        case "fail":
          throw new Error(
            `Overlay conflict: Field '${fieldName}' does not exist (overlay: ${change.overlayId}, mode: fail)`,
          );
        case "overwrite":
        case "merge":
          // Both overwrite and merge add the field if it doesn't exist
          schema.fields.push(updates as FieldDefinition);
          console.log(
            JSON.stringify({
              msg: "overlay_field_created_from_modify",
              field: fieldName,
              overlay_id: change.overlayId,
            }),
          );
          break;
      }
    } else {
      // Field exists - merge updates
      schema.fields[existingIndex] = {
        ...schema.fields[existingIndex],
        ...updates,
      };
      console.log(
        JSON.stringify({
          msg: "overlay_field_modified",
          field: fieldName,
          overlay_id: change.overlayId,
        }),
      );
    }
  }

  /**
   * Apply remove_field change
   * Removes a field from the schema
   */
  private applyRemoveField(schema: EntitySchema, change: OverlayChange): void {
    const fieldName = change.changeJson.name as string;
    const existingIndex = schema.fields.findIndex((f) => f.name === fieldName);

    if (existingIndex === -1) {
      // Field doesn't exist
      if (change.conflictMode === "fail") {
        throw new Error(
          `Overlay conflict: Cannot remove non-existent field '${fieldName}' (overlay: ${change.overlayId}, mode: fail)`,
        );
      }
      // For overwrite and merge modes, silently skip if field doesn't exist
      console.log(
        JSON.stringify({
          msg: "overlay_field_remove_skipped",
          field: fieldName,
          overlay_id: change.overlayId,
          reason: "field_not_found",
        }),
      );
    } else {
      // Remove field
      schema.fields.splice(existingIndex, 1);
      console.log(
        JSON.stringify({
          msg: "overlay_field_removed",
          field: fieldName,
          overlay_id: change.overlayId,
        }),
      );
    }
  }

  /**
   * Apply tweak_policy change
   * Modifies or adds a policy to the schema
   */
  private applyTweakPolicy(schema: EntitySchema, change: OverlayChange): void {
    const policyDef = change.changeJson as PolicyDefinition;
    if (!schema.policies) {
      schema.policies = [];
    }

    const existingIndex = schema.policies.findIndex(
      (p) => p.name === policyDef.name,
    );

    if (existingIndex !== -1) {
      // Policy exists - handle conflict
      switch (change.conflictMode) {
        case "fail":
          throw new Error(
            `Overlay conflict: Policy '${policyDef.name}' already exists (overlay: ${change.overlayId}, mode: fail)`,
          );
        case "overwrite":
          schema.policies[existingIndex] = policyDef;
          console.log(
            JSON.stringify({
              msg: "overlay_policy_overwritten",
              policy: policyDef.name,
              overlay_id: change.overlayId,
            }),
          );
          break;
        case "merge":
          // Deep merge policy definition
          schema.policies[existingIndex] = {
            ...schema.policies[existingIndex],
            ...policyDef,
          };
          console.log(
            JSON.stringify({
              msg: "overlay_policy_merged",
              policy: policyDef.name,
              overlay_id: change.overlayId,
            }),
          );
          break;
      }
    } else {
      // Policy doesn't exist - add it
      schema.policies.push(policyDef);
      console.log(
        JSON.stringify({
          msg: "overlay_policy_added",
          policy: policyDef.name,
          overlay_id: change.overlayId,
        }),
      );
    }
  }

  /**
   * Compute hash for overlay set + compiled output
   * Used for caching compiled models with specific overlay combinations
   */
  private computeOverlaySetHash(
    overlaySet: OverlaySet,
    baseOutputHash: string,
  ): string {
    const combined = {
      overlaySet,
      baseOutputHash,
    };
    const canonical = this.canonicalizeJSON(combined);
    const hash = createHash("sha256");
    hash.update(canonical);
    return hash.digest("hex");
  }
}
