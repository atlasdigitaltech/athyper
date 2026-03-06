import "server-only";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ─── Singleton DB Client ─────────────────────────────────────
// Reused across requests to avoid creating a new pool per call.

let _db: Kysely<DB> | null = null;

/**
 * Returns true when a direct DATABASE_URL is configured,
 * allowing BFF routes to query PostgreSQL without the runtime API.
 */
export function hasDirectDb(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Returns a Kysely<DB> instance connected via DATABASE_URL.
 * Throws if DATABASE_URL is not set.
 */
export async function getDb(): Promise<Kysely<DB>> {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");

  const { Pool } = await import("pg");
  const { Kysely: K, PostgresDialect } = await import("kysely");

  const pool = new Pool({ connectionString: url });
  _db = new K<DB>({ dialect: new PostgresDialect({ pool }) });
  return _db;
}

// ─── Entity Queries ──────────────────────────────────────────

/**
 * List all entities from meta.entity with version/field/relation enrichment.
 * Replicates MetaRegistryService.listEntities() + enrichEntities().
 */
export async function listEntitiesDirect(): Promise<{
  success: boolean;
  data: unknown[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  const db = await getDb();

  // Fetch all entities
  const [countResult, entities] = await Promise.all([
    db
      .selectFrom("meta.entity")
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("meta.entity")
      .selectAll()
      .orderBy("created_at", "desc")
      .execute(),
  ]);

  const total = Number(countResult.count);
  const entityIds = entities.map((e) => e.id);

  // Fetch latest version per entity
  const versions =
    entityIds.length > 0
      ? await db
          .selectFrom("meta.entity_version")
          .selectAll()
          .where("entity_id", "in", entityIds)
          .orderBy("version_no", "desc")
          .execute()
      : [];

  const latestVersionByEntity = new Map<string, (typeof versions)[0]>();
  for (const v of versions) {
    if (!latestVersionByEntity.has(v.entity_id as string)) {
      latestVersionByEntity.set(v.entity_id as string, v);
    }
  }

  const versionIds = [...latestVersionByEntity.values()].map(
    (v) => v.id as string,
  );

  // Batch field/relation counts
  const [fieldCountRows, relationCountRows] =
    versionIds.length > 0
      ? await Promise.all([
          db
            .selectFrom("meta.field")
            .select("entity_version_id")
            .select((eb) => eb.fn.countAll().as("count"))
            .where("entity_version_id", "in", versionIds)
            .groupBy("entity_version_id")
            .execute(),
          db
            .selectFrom("meta.relation")
            .select("entity_version_id")
            .select((eb) => eb.fn.countAll().as("count"))
            .where("entity_version_id", "in", versionIds)
            .groupBy("entity_version_id")
            .execute(),
        ])
      : [[], []];

  const fieldCountByVersion = new Map<string, number>();
  for (const row of fieldCountRows) {
    fieldCountByVersion.set(
      row.entity_version_id as string,
      Number((row as any).count),
    );
  }

  const relationCountByVersion = new Map<string, number>();
  for (const row of relationCountRows) {
    relationCountByVersion.set(
      row.entity_version_id as string,
      Number((row as any).count),
    );
  }

  // Map and enrich
  const data = entities.map((e) => {
    const latestVersion = latestVersionByEntity.get(e.id);
    const versionId = latestVersion?.id as string | undefined;

    return {
      id: e.id,
      name: e.name,
      kind: e.kind ?? "ent",
      moduleId: e.module_id ?? null,
      tableSchema: e.table_schema ?? "ent",
      tableName: e.table_name ?? e.name,
      isActive: e.is_active ?? true,
      governanceLevel: (e as any).governance_level ?? "full",
      engineTag: (e as any).engine_tag ?? null,
      currentVersion: latestVersion
        ? {
            id: latestVersion.id,
            versionNo: (latestVersion as any).version_no ?? 1,
            status: latestVersion.status ?? "draft",
            label: latestVersion.label ?? null,
            publishedAt: (latestVersion as any).published_at ?? null,
            publishedBy: (latestVersion as any).published_by ?? null,
            createdAt: latestVersion.created_at,
          }
        : null,
      fieldCount: versionId ? (fieldCountByVersion.get(versionId) ?? 0) : 0,
      relationCount: versionId
        ? (relationCountByVersion.get(versionId) ?? 0)
        : 0,
      updatedAt: e.updated_at ?? e.created_at,
    };
  });

  return {
    success: true,
    data,
    meta: {
      page: 1,
      pageSize: total,
      total,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
}

/**
 * Get a single entity by name with version/field/relation enrichment.
 */
export async function getEntityDirect(entityName: string): Promise<{
  success: boolean;
  data: unknown | null;
}> {
  const db = await getDb();

  const entity = await db
    .selectFrom("meta.entity")
    .selectAll()
    .where("name", "=", entityName)
    .executeTakeFirst();

  if (!entity) return { success: false, data: null };

  // Latest version
  const latestVersion = await db
    .selectFrom("meta.entity_version")
    .selectAll()
    .where("entity_id", "=", entity.id)
    .orderBy("version_no", "desc")
    .limit(1)
    .executeTakeFirst();

  const versionId = latestVersion?.id as string | undefined;

  // Field/relation counts
  let fieldCount = 0;
  let relationCount = 0;
  if (versionId) {
    const [fc, rc] = await Promise.all([
      db
        .selectFrom("meta.field")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("entity_version_id", "=", versionId)
        .executeTakeFirst(),
      db
        .selectFrom("meta.relation")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("entity_version_id", "=", versionId)
        .executeTakeFirst(),
    ]);
    fieldCount = Number((fc as any)?.count ?? 0);
    relationCount = Number((rc as any)?.count ?? 0);
  }

  return {
    success: true,
    data: {
      id: entity.id,
      name: entity.name,
      kind: entity.kind ?? "ent",
      moduleId: entity.module_id ?? null,
      tableSchema: entity.table_schema ?? "ent",
      tableName: entity.table_name ?? entity.name,
      isActive: entity.is_active ?? true,
      governanceLevel: (entity as any).governance_level ?? "full",
      engineTag: (entity as any).engine_tag ?? null,
      currentVersion: latestVersion
        ? {
            id: latestVersion.id,
            versionNo: (latestVersion as any).version_no ?? 1,
            status: latestVersion.status ?? "draft",
            label: latestVersion.label ?? null,
            publishedAt: (latestVersion as any).published_at ?? null,
            publishedBy: (latestVersion as any).published_by ?? null,
            createdAt: latestVersion.created_at,
          }
        : null,
      fieldCount,
      relationCount,
      updatedAt: entity.updated_at ?? entity.created_at,
    },
  };
}

/**
 * Create a new entity in meta.entity, returning the created record.
 */
export async function createEntityDirect(data: {
  name: string;
  kind?: string;
  moduleId?: string;
  tableSchema?: string;
  tableName?: string;
  governanceLevel?: string;
  engineTag?: string;
  identityConfig?: Record<string, unknown> | null;
}): Promise<{ success: boolean; data: unknown }> {
  const db = await getDb();

  const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";

  const entity = await db
    .insertInto("meta.entity")
    .values({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      module_id: data.moduleId ?? "default",
      name: data.name,
      kind: data.kind ?? "ent",
      table_schema: data.tableSchema ?? "ent",
      table_name: data.tableName ?? data.name,
      governance_level: data.governanceLevel ?? "full",
      engine_tag: data.engineTag ?? null,
      identity_config: data.identityConfig ? JSON.stringify(data.identityConfig) : null,
      is_active: true,
      created_by: "admin",
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    success: true,
    data: {
      id: entity.id,
      name: entity.name,
      kind: entity.kind ?? "ent",
      moduleId: entity.module_id ?? null,
      tableSchema: entity.table_schema ?? "ent",
      tableName: entity.table_name ?? entity.name,
      isActive: entity.is_active ?? true,
      governanceLevel: (entity as any).governance_level ?? "full",
      engineTag: (entity as any).engine_tag ?? null,
      currentVersion: null,
      fieldCount: 0,
      relationCount: 0,
      updatedAt: entity.updated_at ?? entity.created_at,
    },
  };
}

/**
 * Update an entity in meta.entity by name.
 */
export async function updateEntityDirect(
  entityName: string,
  updates: Record<string, unknown>,
): Promise<{
  success: boolean;
  data: unknown | null;
}> {
  const db = await getDb();

  const dbUpdates: Record<string, unknown> = { updated_at: new Date() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.kind !== undefined) dbUpdates.kind = updates.kind;
  if (updates.tableSchema !== undefined)
    dbUpdates.table_schema = updates.tableSchema;
  if (updates.tableName !== undefined) dbUpdates.table_name = updates.tableName;
  if (updates.moduleId !== undefined) dbUpdates.module_id = updates.moduleId;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.governanceLevel !== undefined)
    dbUpdates.governance_level = updates.governanceLevel;
  if (updates.engineTag !== undefined) dbUpdates.engine_tag = updates.engineTag;
  if (updates.identityConfig !== undefined)
    dbUpdates.identity_config = updates.identityConfig ? JSON.stringify(updates.identityConfig) : null;

  const entity = await db
    .updateTable("meta.entity")
    .set(dbUpdates as any)
    .where("name", "=", entityName)
    .returningAll()
    .executeTakeFirst();

  if (!entity) return { success: false, data: null };

  return getEntityDirect(entity.name);
}

/**
 * Delete an entity from meta.entity by name.
 */
export async function deleteEntityDirect(
  entityName: string,
): Promise<{ success: boolean }> {
  const db = await getDb();
  await db.deleteFrom("meta.entity").where("name", "=", entityName).execute();
  return { success: true };
}

// ─── Sub-resource Queries ────────────────────────────────────

async function resolveLatestVersionId(
  entityName: string,
): Promise<{ entityId: string; versionId: string } | null> {
  const db = await getDb();
  const entity = await db
    .selectFrom("meta.entity")
    .select(["id"])
    .where("name", "=", entityName)
    .executeTakeFirst();
  if (!entity) return null;
  const version = await db
    .selectFrom("meta.entity_version")
    .select(["id"])
    .where("entity_id", "=", entity.id)
    .orderBy("version_no", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!version) return null;
  return { entityId: entity.id as string, versionId: version.id as string };
}

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

    // ── Phase 1: Structured configs & semantic format ──
    format: row.format ?? null,
    unit: row.unit ?? null,
    cardinality: row.cardinality ?? "one",
    origin: row.origin ?? "business",
    label: row.label ?? null,
    description: row.description ?? null,
    constraints: row.constraints ?? null,
    enumConfig: row.enum_config ?? null,
    referenceConfig: row.reference_config ?? null,
    jsonConfig: row.json_config ?? null,
    moneyConfig: row.money_config ?? null,
    datetimeConfig: row.datetime_config ?? null,
    uiHint: row.ui_hint ?? null,
    isReadOnly: row.is_read_only ?? false,
    isDeprecated: row.is_deprecated ?? false,
    isComputed: row.is_computed ?? false,
    writeOnce: row.write_once ?? false,

    // ── Enhancement 043: Visibility, editability, list caps, computed, collection ──
    visibility: row.visibility ?? null,
    editability: row.editability ?? null,
    isSortable: row.is_sortable ?? false,
    isGroupable: row.is_groupable ?? false,
    isAggregatable: row.is_aggregatable ?? false,
    computeMode: row.compute_mode ?? null,
    computeExpr: row.compute_expr ?? null,
    childEntityName: row.child_entity_name ?? null,
    childFkField: row.child_fk_field ?? null,
    collectionBehavior: row.collection_behavior ?? null,

    // ── Lookup system (044) ──
    lookupProfile: row.lookup_profile ?? null,
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

export async function listFieldsDirect(entityName: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName);
  if (!resolved) return { success: false, data: [] };
  const rows = await db
    .selectFrom("meta.field")
    .selectAll()
    .where("entity_version_id", "=", resolved.versionId)
    .orderBy("sort_order", "asc")
    .execute();
  return { success: true, data: rows.map(mapField) };
}

export async function listRelationsDirect(entityName: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName);
  if (!resolved) return { success: false, data: [] };
  const rows = await db
    .selectFrom("meta.relation")
    .selectAll()
    .where("entity_version_id", "=", resolved.versionId)
    .execute();
  return { success: true, data: rows.map(mapRelation) };
}

export async function listIndexesDirect(entityName: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName);
  if (!resolved) return { success: false, data: [] };
  const rows = await db
    .selectFrom("meta.index_def")
    .selectAll()
    .where("entity_version_id", "=", resolved.versionId)
    .execute();
  return {
    success: true,
    data: rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      isUnique: r.is_unique ?? false,
      method: r.method ?? "btree",
      columns: r.columns ?? [],
      whereClause: r.where_clause ?? null,
      createdAt: r.created_at,
    })),
  };
}

export async function listVersionsDirect(entityName: string) {
  const db = await getDb();
  const entity = await db
    .selectFrom("meta.entity")
    .select(["id"])
    .where("name", "=", entityName)
    .executeTakeFirst();
  if (!entity) return { success: false, data: [] };
  const rows = await db
    .selectFrom("meta.entity_version")
    .selectAll()
    .where("entity_id", "=", entity.id)
    .orderBy("version_no", "desc")
    .execute();
  return {
    success: true,
    data: rows.map((r: any) => ({
      id: r.id,
      versionNo: r.version_no ?? 1,
      status: r.status ?? "draft",
      label: r.label ?? null,
      publishedAt: r.published_at ?? null,
      publishedBy: r.published_by ?? null,
      createdAt: r.created_at,
    })),
  };
}

export async function getPoliciesDirect(entityName: string) {
  const db = await getDb();
  const entity = await db
    .selectFrom("meta.entity")
    .select(["id"])
    .where("name", "=", entityName)
    .executeTakeFirst();
  if (!entity)
    return {
      success: false,
      data: { entityPolicy: null, fieldSecurityPolicies: [] },
    };
  const entityPolicy = await db
    .selectFrom("meta.entity_policy")
    .selectAll()
    .where("entity_id", "=", entity.id)
    .executeTakeFirst();
  const fieldSecurityPolicies = await db
    .selectFrom("meta.field_security_policy")
    .selectAll()
    .where("entity_id", "=", entity.id)
    .where("is_active", "=", true)
    .orderBy("priority", "asc")
    .execute();
  return {
    success: true,
    data: {
      entityPolicy: entityPolicy
        ? {
            id: entityPolicy.id,
            accessMode: (entityPolicy as any).access_mode ?? "default_deny",
            ouScopeMode: (entityPolicy as any).ou_scope_mode ?? "none",
            auditMode: (entityPolicy as any).audit_mode ?? "enabled",
            retentionPolicy: (entityPolicy as any).retention_policy ?? null,
            defaultFilters: (entityPolicy as any).default_filters ?? null,
            cacheFlags: (entityPolicy as any).cache_flags ?? null,
            createdAt: entityPolicy.created_at,
          }
        : null,
      fieldSecurityPolicies: fieldSecurityPolicies.map((r: any) => ({
        id: r.id,
        fieldPath: r.field_path,
        policyType: r.policy_type,
        roleList: r.role_list ?? null,
        abacCondition: r.abac_condition ?? null,
        maskStrategy: r.mask_strategy ?? "null",
        maskConfig: r.mask_config ?? null,
        scope: r.scope ?? "entity",
        priority: r.priority ?? 100,
        isActive: r.is_active ?? true,
      })),
    },
  };
}

export async function getCompiledDirect(entityName: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName);
  if (!resolved) return { success: true, data: null };
  const compiled = await db
    .selectFrom("meta.entity_compiled")
    .selectAll()
    .where("entity_version_id", "=", resolved.versionId)
    .orderBy("generated_at", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!compiled) return { success: true, data: null };
  return {
    success: true,
    data: {
      id: compiled.id,
      entityVersionId: (compiled as any).entity_version_id,
      compiledJson: (compiled as any).compiled_json,
      compiledHash: (compiled as any).compiled_hash,
      generatedAt: (compiled as any).generated_at,
    },
  };
}

export async function getValidationDirect(entityName: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName);
  if (!resolved) return { success: true, data: { version: 1, rules: [] } };
  const fieldsWithValidation = await db
    .selectFrom("meta.field")
    .select(["name", "validation"])
    .where("entity_version_id", "=", resolved.versionId)
    .where("validation", "is not", null)
    .execute();
  const rules = fieldsWithValidation
    .filter((f) => f.validation)
    .map((f) => ({ fieldName: f.name, rules: f.validation }));
  return { success: true, data: { version: 1, rules } };
}
