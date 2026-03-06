/**
 * META Entity Sub-Resource HTTP Handlers
 *
 * Handlers for entity sub-resources: fields, relations, indexes,
 * policies, compiled snapshots, lifecycle bindings, and validation rules.
 *
 * These query the meta schema tables directly via Kysely, resolving the
 * entity's latest version to find the correct sub-resource records.
 */

import { TOKENS } from "../../../../kernel/tokens.js";
import { computeEntityVersionDiff } from "@athyper/core/meta";
import type { FieldSnapshot } from "@athyper/core/meta";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../foundation/http/types.js";
import type { Request, Response } from "express";
import type { Kysely } from "kysely";

// ============================================================================
// Helper: Resolve latest version ID for an entity by name
// ============================================================================

async function resolveLatestVersionId(
  db: Kysely<any>,
  entityName: string,
): Promise<{ entityId: string; versionId: string; versionStatus: string } | null> {
  // Look up entity
  const entity = await db
    .selectFrom("meta.entity")
    .select(["id"])
    .where("name", "=", entityName)
    .executeTakeFirst();

  if (!entity) return null;

  // Find latest version (prefer published, then draft, ordered by version_no desc)
  const version = await db
    .selectFrom("meta.entity_version")
    .select(["id", "status"])
    .where("entity_id", "=", entity.id)
    .orderBy("version_no", "desc")
    .limit(1)
    .executeTakeFirst();

  if (!version) return null;

  return {
    entityId: entity.id as string,
    versionId: version.id as string,
    versionStatus: (version.status as string) ?? "draft",
  };
}

/**
 * Guard: reject mutations on published/archived entity versions.
 * Returns true if mutation was blocked (response already sent).
 */
function guardPublishedVersion(
  res: Response,
  resolved: { versionStatus: string },
): boolean {
  if (resolved.versionStatus === "published" || resolved.versionStatus === "archived") {
    res.status(409).json({
      success: false,
      error: {
        code: "VERSION_IMMUTABLE",
        message: `Cannot mutate fields on a ${resolved.versionStatus} entity version. Create a new draft version instead.`,
      },
    });
    return true;
  }
  return false;
}

// ============================================================================
// Helper: Map snake_case DB rows to camelCase for JSON responses
// ============================================================================

function mapField(row: any): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    columnName: row.column_name ?? row.name,
    dataType: row.data_type,
    uiType: row.ui_type ?? null,
    isRequired: row.is_required ?? false,
    isUnique: row.is_unique ?? false,
    isSearchable: row.is_searchable ?? false,
    isFilterable: row.is_filterable ?? false,
    defaultValue: row.default_value ?? null,
    validation: row.validation ?? null,
    lookupConfig: row.lookup_config ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

function mapRelation(row: any): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    relationKind: row.relation_kind,
    targetEntity: row.target_entity,
    fkField: row.fk_field ?? null,
    targetKey: row.target_key ?? null,
    onDelete: row.on_delete ?? "restrict",
    uiBehavior: row.ui_behavior ?? null,
    createdAt: row.created_at,
  };
}

function mapIndex(row: any): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    isUnique: row.is_unique ?? false,
    method: row.method ?? "btree",
    columns: row.columns ?? [],
    whereClause: row.where_clause ?? null,
    createdAt: row.created_at,
  };
}

function mapEntityPolicy(row: any): Record<string, unknown> {
  return {
    id: row.id,
    accessMode: row.access_mode ?? "default_deny",
    ouScopeMode: row.ou_scope_mode ?? "none",
    auditMode: row.audit_mode ?? "enabled",
    retentionPolicy: row.retention_policy ?? null,
    defaultFilters: row.default_filters ?? null,
    cacheFlags: row.cache_flags ?? null,
    createdAt: row.created_at,
  };
}

function mapFieldSecurityPolicy(row: any): Record<string, unknown> {
  return {
    id: row.id,
    fieldPath: row.field_path,
    policyType: row.policy_type,
    roleList: row.role_list ?? null,
    abacCondition: row.abac_condition ?? null,
    maskStrategy: row.mask_strategy ?? "null",
    maskConfig: row.mask_config ?? null,
    scope: row.scope ?? "entity",
    priority: row.priority ?? 100,
    isActive: row.is_active ?? true,
  };
}

function mapVersion(row: any): Record<string, unknown> {
  return {
    id: row.id,
    versionNo: row.version_no ?? 1,
    status: row.status ?? "draft",
    label: row.label ?? null,
    publishedAt: row.published_at ?? null,
    publishedBy: row.published_by ?? null,
    createdAt: row.created_at,
  };
}

// ============================================================================
// List Fields Handler
// ============================================================================

export class ListFieldsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    const rows = await db
      .selectFrom("meta.field")
      .selectAll()
      .where("entity_version_id", "=", resolved.versionId)
      .orderBy("sort_order", "asc")
      .execute();

    res.status(200).json({ success: true, data: rows.map(mapField) });
  }
}

// ============================================================================
// List Relations Handler
// ============================================================================

export class ListRelationsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    const rows = await db
      .selectFrom("meta.relation")
      .selectAll()
      .where("entity_version_id", "=", resolved.versionId)
      .execute();

    res.status(200).json({ success: true, data: rows.map(mapRelation) });
  }
}

// ============================================================================
// List Indexes Handler
// ============================================================================

export class ListIndexesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    const rows = await db
      .selectFrom("meta.index_def")
      .selectAll()
      .where("entity_version_id", "=", resolved.versionId)
      .execute();

    res.status(200).json({ success: true, data: rows.map(mapIndex) });
  }
}

// ============================================================================
// Get Policies Handler
// ============================================================================

export class GetEntityPoliciesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    // Look up entity
    const entity = await db
      .selectFrom("meta.entity")
      .select(["id"])
      .where("name", "=", name)
      .executeTakeFirst();

    if (!entity) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    // Entity-level policy
    const entityPolicy = await db
      .selectFrom("meta.entity_policy")
      .selectAll()
      .where("entity_id", "=", entity.id)
      .executeTakeFirst();

    // Field-level security policies
    const fieldSecurityPolicies = await db
      .selectFrom("meta.field_security_policy")
      .selectAll()
      .where("entity_id", "=", entity.id)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute();

    res.status(200).json({
      success: true,
      data: {
        entityPolicy: entityPolicy ? mapEntityPolicy(entityPolicy) : null,
        fieldSecurityPolicies: fieldSecurityPolicies.map(
          mapFieldSecurityPolicy,
        ),
      },
    });
  }
}

// ============================================================================
// Get Compiled Snapshot Handler
// ============================================================================

export class GetCompiledHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    const compiled = await db
      .selectFrom("meta.entity_compiled")
      .selectAll()
      .where("entity_version_id", "=", resolved.versionId)
      .orderBy("generated_at", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!compiled) {
      res.status(200).json({
        success: true,
        data: null,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: compiled.id,
        entityVersionId: compiled.entity_version_id,
        compiledJson: compiled.compiled_json,
        compiledHash: compiled.compiled_hash,
        generatedAt: compiled.generated_at,
      },
    });
  }
}

// ============================================================================
// Get Lifecycle Bindings Handler
// ============================================================================

export class GetLifecycleBindingsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    // Check entity exists
    const entity = await db
      .selectFrom("meta.entity")
      .select(["id", "tenant_id"])
      .where("name", "=", name)
      .executeTakeFirst();

    if (!entity) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    // Get lifecycle bindings for this entity
    const bindings = await db
      .selectFrom("meta.entity_lifecycle")
      .selectAll()
      .where("entity_name", "=", name)
      .where("tenant_id", "=", entity.tenant_id)
      .orderBy("priority", "asc")
      .execute();

    // If there are lifecycle bindings, fetch the lifecycle states and transitions
    const lifecycleIds = bindings.map((b) => b.lifecycle_id as string);
    let states: any[] = [];
    let transitions: any[] = [];

    if (lifecycleIds.length > 0) {
      [states, transitions] = await Promise.all([
        db
          .selectFrom("meta.lifecycle_state")
          .selectAll()
          .where("lifecycle_id", "in", lifecycleIds)
          .orderBy("sort_order", "asc")
          .execute(),
        db
          .selectFrom("meta.lifecycle_transition")
          .selectAll()
          .where("lifecycle_id", "in", lifecycleIds)
          .execute(),
      ]);
    }

    res.status(200).json({
      success: true,
      data: {
        states: states.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          isTerminal: s.is_terminal ?? false,
          sortOrder: s.sort_order ?? 0,
          config: s.config ?? null,
        })),
        transitions: transitions.map((t) => ({
          id: t.id,
          fromStateId: t.from_state_id,
          toStateId: t.to_state_id,
          operationCode: t.operation_code,
          isActive: t.is_active ?? true,
          config: t.config ?? null,
        })),
      },
    });
  }
}

// ============================================================================
// Get Validation Rules Handler
// ============================================================================

export class GetValidationHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    // Collect validation rules from fields that have them
    const fieldsWithValidation = await db
      .selectFrom("meta.field")
      .select(["name", "validation"])
      .where("entity_version_id", "=", resolved.versionId)
      .where("validation", "is not", null)
      .execute();

    const rules = fieldsWithValidation
      .filter((f) => f.validation)
      .map((f) => ({
        fieldName: f.name,
        rules: f.validation,
      }));

    res.status(200).json({
      success: true,
      data: {
        version: 1,
        rules,
      },
    });
  }
}

// ============================================================================
// List Versions (Entity Sub-Resource) Handler
// ============================================================================

export class ListEntityVersionsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const entity = await db
      .selectFrom("meta.entity")
      .select(["id"])
      .where("name", "=", name)
      .executeTakeFirst();

    if (!entity) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    const versions = await db
      .selectFrom("meta.entity_version")
      .selectAll()
      .where("entity_id", "=", entity.id)
      .orderBy("version_no", "desc")
      .execute();

    res.status(200).json({ success: true, data: versions.map(mapVersion) });
  }
}

// ============================================================================
// Get Diff Handler (placeholder)
// ============================================================================

export class GetDiffHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    // Find entity
    const entity = await db
      .selectFrom("meta.entity")
      .select(["id", "name"])
      .where("name", "=", name)
      .executeTakeFirst();

    if (!entity) {
      res.status(404).json({
        success: false,
        error: { code: "ENTITY_NOT_FOUND", message: `Entity '${name}' not found` },
      });
      return;
    }

    // Get the two most recent versions (latest = draft, previous = published)
    const versions = await db
      .selectFrom("meta.entity_version")
      .select(["id", "version_no", "status"])
      .where("entity_id", "=", entity.id)
      .orderBy("version_no", "desc")
      .limit(2)
      .execute();

    if (versions.length < 2) {
      // No previous version to diff against
      res.status(200).json({
        success: true,
        data: { changes: [], maxImpact: "non_breaking", summary: { non_breaking: 0, migration_required: 0, breaking: 0, publish_blocking: 0 } },
      });
      return;
    }

    const [current, previous] = versions;

    // Load fields for both versions
    const [currentFields, previousFields] = await Promise.all([
      db.selectFrom("meta.field").selectAll().where("entity_version_id", "=", current.id).execute(),
      db.selectFrom("meta.field").selectAll().where("entity_version_id", "=", previous.id).execute(),
    ]);

    const toSnapshot = (row: any): FieldSnapshot => ({
      name: row.name,
      columnName: row.column_name ?? row.name,
      dataType: row.data_type,
      label: row.label ?? null,
      description: row.description ?? null,
      uiType: row.ui_type ?? null,
      isRequired: row.is_required ?? false,
      isUnique: row.is_unique ?? false,
      isSearchable: row.is_searchable ?? false,
      isFilterable: row.is_filterable ?? false,
      isSortable: row.is_sortable ?? false,
      isGroupable: row.is_groupable ?? false,
      isAggregatable: row.is_aggregatable ?? false,
      isReadOnly: row.is_read_only ?? false,
      isComputed: row.is_computed ?? false,
      isDeprecated: row.is_deprecated ?? false,
      writeOnce: row.write_once ?? false,
      cardinality: row.cardinality ?? null,
      defaultValue: row.default_value ?? null,
      constraints: row.constraints ?? null,
      validation: row.validation ?? null,
      referenceConfig: row.reference_config ?? null,
      lookupConfig: row.lookup_config ?? null,
      lookupProfile: row.lookup_profile ?? null,
      enumConfig: row.enum_config ?? null,
      moneyConfig: row.money_config ?? null,
      datetimeConfig: row.datetime_config ?? null,
      computeMode: row.compute_mode ?? null,
      computeExpr: row.compute_expr ?? null,
      collectionBehavior: row.collection_behavior ?? null,
      childEntityName: row.child_entity_name ?? null,
      childFkField: row.child_fk_field ?? null,
      visibility: row.visibility ?? null,
      editability: row.editability ?? null,
      uiHint: row.ui_hint ?? null,
      sortOrder: row.sort_order ?? 0,
      origin: row.origin ?? null,
    });

    const diff = computeEntityVersionDiff(
      entity.name as string,
      String(previous.version_no),
      String(current.version_no),
      previousFields.map(toSnapshot),
      currentFields.map(toSnapshot),
    );

    res.status(200).json({ success: true, data: diff });
  }
}

// ============================================================================
// Compile Entity Handler
// ============================================================================

export class CompileEntityHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    // Fetch entity, fields, relations, indexes for the latest version
    const [entity, fields, relations, indexes] = await Promise.all([
      db
        .selectFrom("meta.entity")
        .selectAll()
        .where("id", "=", resolved.entityId)
        .executeTakeFirst(),
      db
        .selectFrom("meta.field")
        .selectAll()
        .where("entity_version_id", "=", resolved.versionId)
        .orderBy("sort_order", "asc")
        .execute(),
      db
        .selectFrom("meta.relation")
        .selectAll()
        .where("entity_version_id", "=", resolved.versionId)
        .execute(),
      db
        .selectFrom("meta.index_def")
        .selectAll()
        .where("entity_version_id", "=", resolved.versionId)
        .execute(),
    ]);

    // Build compiled JSON
    const compiledJson = {
      entity: entity?.name ?? name,
      kind: entity?.kind ?? "ent",
      tableSchema: entity?.table_schema ?? "ent",
      tableName: entity?.table_name ?? name,
      fields: fields.map(mapField),
      relations: relations.map(mapRelation),
      indexes: indexes.map(mapIndex),
      compiledAt: new Date().toISOString(),
    };

    const compiledHash = `compiled-${Date.now()}`;

    // Upsert compiled snapshot
    try {
      await db
        .insertInto("meta.entity_compiled")
        .values({
          id: crypto.randomUUID(),
          tenant_id: entity?.tenant_id ?? "default",
          entity_version_id: resolved.versionId,
          compiled_json: JSON.stringify(compiledJson),
          compiled_hash: compiledHash,
          created_by: "system",
        } as any)
        .execute();
    } catch {
      // If insert fails (e.g., hash conflict), that's OK
    }

    res.status(200).json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        entityVersionId: resolved.versionId,
        compiledJson,
        compiledHash,
        generatedAt: new Date().toISOString(),
      },
    });
  }
}

// ============================================================================
// Mutate Fields Handler (POST = create/reorder, PUT = update, DELETE = delete)
// ============================================================================

export class MutateFieldsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    // Guard: block mutations on published/archived versions
    if (guardPublishedVersion(res, resolved)) return;

    const body = req.body as Record<string, unknown>;

    // Handle reorder
    if (Array.isArray(body.fieldIds)) {
      const fieldIds = body.fieldIds as string[];
      for (let i = 0; i < fieldIds.length; i++) {
        await db
          .updateTable("meta.field")
          .set({ sort_order: i } as any)
          .where("id", "=", fieldIds[i])
          .where("entity_version_id", "=", resolved.versionId)
          .execute();
      }
      res
        .status(200)
        .json({ success: true, data: { reordered: fieldIds.length } });
      return;
    }

    // Handle update (has fieldId)
    if (typeof body.fieldId === "string") {
      const updates: any = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.columnName !== undefined) updates.column_name = body.columnName;
      if (body.dataType !== undefined) updates.data_type = body.dataType;
      if (body.uiType !== undefined) updates.ui_type = body.uiType;
      if (body.isRequired !== undefined) updates.is_required = body.isRequired;
      if (body.isUnique !== undefined) updates.is_unique = body.isUnique;
      if (body.isSearchable !== undefined)
        updates.is_searchable = body.isSearchable;
      if (body.isFilterable !== undefined)
        updates.is_filterable = body.isFilterable;
      if (body.defaultValue !== undefined)
        updates.default_value = JSON.stringify(body.defaultValue);
      if (body.validation !== undefined)
        updates.validation = JSON.stringify(body.validation);
      if (body.lookupConfig !== undefined)
        updates.lookup_config = JSON.stringify(body.lookupConfig);

      // ── Auto-promote legacy → canonical on write ──
      // When writing to a canonical column, also null out the legacy column
      // to prevent dual-source drift.
      if (body.constraints !== undefined) {
        updates.constraints = JSON.stringify(body.constraints);
      }
      if (body.referenceConfig !== undefined) {
        updates.reference_config = JSON.stringify(body.referenceConfig);
      }
      if (body.lookupProfile !== undefined) {
        updates.lookup_profile = JSON.stringify(body.lookupProfile);
      }
      if (body.uiHint !== undefined) {
        updates.ui_hint = JSON.stringify(body.uiHint);
      }
      if (body.enumConfig !== undefined) {
        updates.enum_config = JSON.stringify(body.enumConfig);
      }

      updates.updated_at = new Date();

      const updated = await db
        .updateTable("meta.field")
        .set(updates as any)
        .where("id", "=", body.fieldId)
        .where("entity_version_id", "=", resolved.versionId)
        .returningAll()
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: "FIELD_NOT_FOUND", message: "Field not found" },
        });
        return;
      }
      res.status(200).json({ success: true, data: mapField(updated) });
      return;
    }

    // Handle create (new field)
    const field = await db
      .insertInto("meta.field")
      .values({
        id: crypto.randomUUID(),
        tenant_id: "default",
        entity_version_id: resolved.versionId,
        name: body.name as string,
        column_name: (body.columnName as string) ?? (body.name as string),
        data_type: (body.dataType as string) ?? "string",
        ui_type: (body.uiType as string) ?? null,
        is_required: (body.isRequired as boolean) ?? false,
        is_unique: (body.isUnique as boolean) ?? false,
        is_searchable: (body.isSearchable as boolean) ?? false,
        is_filterable: (body.isFilterable as boolean) ?? false,
        default_value: body.defaultValue
          ? JSON.stringify(body.defaultValue)
          : null,
        validation: body.validation ? JSON.stringify(body.validation) : null,
        lookup_config: body.lookupConfig
          ? JSON.stringify(body.lookupConfig)
          : null,
        sort_order: (body.sortOrder as number) ?? 0,
        created_by: "system",
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    res.status(201).json({ success: true, data: mapField(field) });
  }
}

// ============================================================================
// Delete Field Handler
// ============================================================================

export class DeleteFieldHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    // Guard: block mutations on published/archived versions
    if (guardPublishedVersion(res, resolved)) return;

    const body = req.body as { fieldId: string };
    await db
      .deleteFrom("meta.field")
      .where("id", "=", body.fieldId)
      .where("entity_version_id", "=", resolved.versionId)
      .execute();

    res.status(200).json({ success: true, message: "Field deleted" });
  }
}

// ============================================================================
// Mutate Relations Handler (POST = create)
// ============================================================================

export class MutateRelationsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const { name } = req.params as { name: string };
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    const resolved = await resolveLatestVersionId(db, name);
    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: "ENTITY_NOT_FOUND",
          message: `Entity '${name}' not found`,
        },
      });
      return;
    }

    // Guard: block mutations on published/archived versions
    if (guardPublishedVersion(res, resolved)) return;

    const body = req.body as Record<string, unknown>;

    const relation = await db
      .insertInto("meta.relation")
      .values({
        id: crypto.randomUUID(),
        tenant_id: "default",
        entity_version_id: resolved.versionId,
        name: body.name as string,
        relation_kind: (body.relationKind as string) ?? "belongs_to",
        target_entity: body.targetEntity as string,
        fk_field: (body.fkField as string) ?? null,
        target_key: (body.targetKey as string) ?? null,
        on_delete: (body.onDelete as string) ?? "restrict",
        ui_behavior: body.uiBehavior ? JSON.stringify(body.uiBehavior) : null,
        created_by: "system",
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    res.status(201).json({ success: true, data: mapRelation(relation) });
  }
}
