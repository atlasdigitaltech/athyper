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

// ─── Module Queries ──────────────────────────────────────────

/**
 * List all modules from core.module.
 * Returns code + name, sorted by code.
 */
export async function listModulesDirect(): Promise<{
  success: boolean;
  data: { code: string; name: string }[];
}> {
  const db = await getDb();
  const rows = await db
    .selectFrom("core.module" as any)
    .select(["code", "name"])
    .orderBy("code", "asc")
    .execute();

  return {
    success: true,
    data: rows.map((r: any) => ({ code: r.code as string, name: r.name as string })),
  };
}

// ─── Entity Queries ──────────────────────────────────────────

/**
 * List all entities from meta.entity with version/field/relation enrichment.
 * Replicates MetaRegistryService.listEntities() + enrichEntities().
 */
export async function listEntitiesDirect(tenantId: string): Promise<{
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

  // Fetch all entities + satellite tables
  const [countResult, entities, publishStates, uiProfiles, numberingPolicies, runtimeProfiles] = await Promise.all([
    db
      .selectFrom("meta.entity")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("tenant_id", "=", tenantId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("meta.entity")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .orderBy("created_at", "desc")
      .execute(),
    db
      .selectFrom("meta.entity_publish_state" as any)
      .selectAll()
      .execute() as Promise<any[]>,
    db
      .selectFrom("meta.entity_ui_profile" as any)
      .selectAll()
      .execute() as Promise<any[]>,
    db
      .selectFrom("meta.entity_numbering_policy" as any)
      .selectAll()
      .execute() as Promise<any[]>,
    db
      .selectFrom("meta.entity_runtime_profile" as any)
      .selectAll()
      .execute() as Promise<any[]>,
  ]);

  const publishStateByEntity = new Map<string, any>();
  for (const ps of publishStates) {
    publishStateByEntity.set(ps.entity_id as string, ps);
  }

  const uiProfileByEntity = new Map<string, any>();
  for (const up of uiProfiles) {
    uiProfileByEntity.set(up.entity_id as string, up);
  }

  const numberingByEntity = new Map<string, any>();
  for (const np of numberingPolicies) {
    numberingByEntity.set(np.entity_id as string, np);
  }

  const runtimeByEntity = new Map<string, any>();
  for (const rp of runtimeProfiles) {
    runtimeByEntity.set(rp.entity_id as string, rp);
  }

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
    const ps = publishStateByEntity.get(e.id as string);
    const up = uiProfileByEntity.get(e.id as string);
    const np = numberingByEntity.get(e.id as string);
    const rp = runtimeByEntity.get(e.id as string);

    const ea = e as any;
    return {
      id: e.id,
      name: e.name,
      entityClass: ea.entity_class ?? "MASTER",
      moduleId: e.module_id ?? null,
      tableSchema: e.table_schema ?? "ent",
      tableName: e.table_name ?? e.name,
      isActive: e.is_active ?? true,
      // Identity & codes
      entityShort: ea.entity_short ?? null,
      entityCode: ea.entity_code ?? null,
      slug: ea.slug ?? null,
      identityConfig: rp?.identity_config ?? ea.identity_config ?? null,
      // Classification
      status: ea.status ?? "active",
      mappingMode: ea.mapping_mode ?? "exclusive",
      backingType: ea.backing_type ?? "table",
      // Runtime profile (from entity_runtime_profile satellite)
      governanceLevel: rp?.governance_level ?? ea.governance_level ?? "full",
      engineTag: rp?.engine_tag ?? ea.engine_tag ?? null,
      ownershipModel: rp?.ownership_model ?? ea.ownership_model ?? "tenant",
      mutability: rp?.mutability ?? ea.mutability ?? "controlled",
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
      // Display metadata (from entity_ui_profile satellite)
      labelSingular: up?.label_singular ?? null,
      labelPlural: up?.label_plural ?? null,
      description: up?.description ?? null,
      iconKey: up?.icon_key ?? null,
      colorToken: up?.color_token ?? null,
      displayConfig: up?.display_config ?? null,
      // Configuration
      featureFlags: rp?.feature_flags ?? ea.feature_flags ?? null,
      dataPolicy: rp?.data_policy ?? ea.data_policy ?? null,
      namingPolicy: np?.naming_policy ?? null,
      provenance: ps?.provenance ?? null,
      // Polymorphism
      discriminatorColumn: ea.discriminator_column ?? null,
      discriminatorValue: ea.discriminator_value ?? null,
      // Status tracking
      statusChangedAt: ea.status_changed_at ?? null,
      statusChangedBy: ea.status_changed_by ?? null,
      statusReason: ea.status_reason ?? null,
      // Audit timestamps
      createdAt: e.created_at,
      createdBy: ea.created_by ?? null,
      updatedBy: ea.updated_by ?? null,
      // Operational (from entity_publish_state satellite)
      publishedVersionId: ps?.published_version_id ?? null,
      lastCompiledAt: ps?.last_compiled_at ?? null,
      lastCompiledHash: ps?.last_compiled_hash ?? null,
      lastSchemaChangeAt: ps?.last_schema_change_at ?? null,
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
export async function getEntityDirect(entityName: string, tenantId?: string): Promise<{
  success: boolean;
  data: unknown | null;
}> {
  const db = await getDb();
  const tid = tenantId ?? process.env.DEFAULT_TENANT_ID ?? "default";

  const entity = await db
    .selectFrom("meta.entity")
    .selectAll()
    .where("name", "=", entityName)
    .where("tenant_id", "=", tid)
    .executeTakeFirst();

  if (!entity) return { success: false, data: null };

  // Satellite tables
  const [publishState, uiProfile, numberingPolicy, runtimeProfile] = await Promise.all([
    db
      .selectFrom("meta.entity_publish_state" as any)
      .selectAll()
      .where("entity_id", "=", entity.id)
      .executeTakeFirst() as Promise<any>,
    db
      .selectFrom("meta.entity_ui_profile" as any)
      .selectAll()
      .where("entity_id", "=", entity.id)
      .executeTakeFirst() as Promise<any>,
    db
      .selectFrom("meta.entity_numbering_policy" as any)
      .selectAll()
      .where("entity_id", "=", entity.id)
      .executeTakeFirst() as Promise<any>,
    db
      .selectFrom("meta.entity_runtime_profile" as any)
      .selectAll()
      .where("entity_id", "=", entity.id)
      .executeTakeFirst() as Promise<any>,
  ]);
  const ps = publishState;
  const up = uiProfile;
  const np = numberingPolicy;
  const rp = runtimeProfile;

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

  const ea = entity as any;
  return {
    success: true,
    data: {
      id: entity.id,
      name: entity.name,
      entityClass: ea.entity_class ?? "MASTER",
      moduleId: entity.module_id ?? null,
      tableSchema: entity.table_schema ?? "ent",
      tableName: entity.table_name ?? entity.name,
      isActive: entity.is_active ?? true,
      // Identity & codes
      entityShort: ea.entity_short ?? null,
      entityCode: ea.entity_code ?? null,
      slug: ea.slug ?? null,
      identityConfig: rp?.identity_config ?? ea.identity_config ?? null,
      // Classification
      status: ea.status ?? "active",
      mappingMode: ea.mapping_mode ?? "exclusive",
      backingType: ea.backing_type ?? "table",
      // Runtime profile (from entity_runtime_profile satellite)
      governanceLevel: rp?.governance_level ?? ea.governance_level ?? "full",
      engineTag: rp?.engine_tag ?? ea.engine_tag ?? null,
      ownershipModel: rp?.ownership_model ?? ea.ownership_model ?? "tenant",
      mutability: rp?.mutability ?? ea.mutability ?? "controlled",
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
      // Display metadata (from entity_ui_profile satellite)
      labelSingular: up?.label_singular ?? null,
      labelPlural: up?.label_plural ?? null,
      description: up?.description ?? null,
      iconKey: up?.icon_key ?? null,
      colorToken: up?.color_token ?? null,
      displayConfig: up?.display_config ?? null,
      // Configuration
      featureFlags: rp?.feature_flags ?? ea.feature_flags ?? null,
      dataPolicy: rp?.data_policy ?? ea.data_policy ?? null,
      namingPolicy: np?.naming_policy ?? null,
      provenance: ps?.provenance ?? null,
      // Polymorphism
      discriminatorColumn: ea.discriminator_column ?? null,
      discriminatorValue: ea.discriminator_value ?? null,
      // Status tracking
      statusChangedAt: ea.status_changed_at ?? null,
      statusChangedBy: ea.status_changed_by ?? null,
      statusReason: ea.status_reason ?? null,
      // Audit timestamps
      createdAt: entity.created_at,
      createdBy: ea.created_by ?? null,
      updatedBy: ea.updated_by ?? null,
      // Operational (from entity_publish_state satellite)
      publishedVersionId: ps?.published_version_id ?? null,
      lastCompiledAt: ps?.last_compiled_at ?? null,
      lastCompiledHash: ps?.last_compiled_hash ?? null,
      lastSchemaChangeAt: ps?.last_schema_change_at ?? null,
    },
  };
}

/**
 * Create a new entity in meta.entity, returning the created record.
 */
export async function createEntityDirect(data: {
  name: string;
  entityClass?: string;
  moduleId?: string;
  tableSchema?: string;
  tableName?: string;
  governanceLevel?: string;
  engineTag?: string;
  identityConfig?: Record<string, unknown> | null;
}, tenantId: string): Promise<{ success: boolean; data: unknown }> {
  const db = await getDb();

  const entityName = data.name;
  const entityCode = entityName; // snake_case code derived from name
  const slug = entityName.replace(/_/g, "-"); // kebab-case slug

  const entity = await db
    .insertInto("meta.entity")
    .values({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      module_id: data.moduleId ?? "default",
      name: entityName,
      entity_class: data.entityClass ?? "MASTER",
      table_schema: data.tableSchema ?? "ent",
      table_name: data.tableName ?? entityName,
      governance_level: data.governanceLevel ?? "full",
      engine_tag: data.engineTag ?? null,
      identity_config: data.identityConfig ? JSON.stringify(data.identityConfig) : null,
      entity_code: entityCode,
      slug,
      status: "active",
      created_by: "admin",
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();

  const ea = entity as any;
  return {
    success: true,
    data: {
      id: entity.id,
      name: entity.name,
      entityClass: ea.entity_class ?? "MASTER",
      moduleId: entity.module_id ?? null,
      tableSchema: entity.table_schema ?? "ent",
      tableName: entity.table_name ?? entity.name,
      isActive: ea.is_active ?? true,
      entityShort: ea.entity_short ?? null,
      entityCode: ea.entity_code ?? null,
      slug: ea.slug ?? null,
      status: ea.status ?? "active",
      mappingMode: ea.mapping_mode ?? "exclusive",
      governanceLevel: ea.governance_level ?? "full",
      engineTag: ea.engine_tag ?? null,
      ownershipModel: ea.ownership_model ?? "tenant",
      mutability: ea.mutability ?? "controlled",
      backingType: ea.backing_type ?? "table",
      currentVersion: null,
      fieldCount: 0,
      relationCount: 0,
      updatedAt: entity.updated_at ?? entity.created_at,
      createdAt: entity.created_at,
      createdBy: ea.created_by ?? null,
    },
  };
}

/**
 * Update an entity in meta.entity by name.
 *
 * Enforces the schema evolution guard: columns that form the entity's
 * stable identity and physical binding (entity_code, table_schema,
 * table_name, entity_class, mapping_mode, backing_type) are
 * immutable once any version has been published.
 */
export async function updateEntityDirect(
  entityName: string,
  updates: Record<string, unknown>,
  tenantId: string,
): Promise<{
  success: boolean;
  data: unknown | null;
  error?: string;
}> {
  const db = await getDb();

  const dbUpdates: Record<string, unknown> = { updated_at: new Date() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.tableSchema !== undefined)
    dbUpdates.table_schema = updates.tableSchema;
  if (updates.tableName !== undefined) dbUpdates.table_name = updates.tableName;
  if (updates.moduleId !== undefined) dbUpdates.module_id = updates.moduleId;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.entityShort !== undefined) dbUpdates.entity_short = updates.entityShort;
  if (updates.entityCode !== undefined) dbUpdates.entity_code = updates.entityCode;
  if (updates.slug !== undefined) dbUpdates.slug = updates.slug;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.entityClass !== undefined) dbUpdates.entity_class = updates.entityClass;
  if (updates.mappingMode !== undefined) dbUpdates.mapping_mode = updates.mappingMode;
  if (updates.backingType !== undefined) dbUpdates.backing_type = updates.backingType;

  // ── Satellite updates ──
  // Runtime profile → entity_runtime_profile
  const runtimeUpdates: Record<string, unknown> = {};
  if (updates.governanceLevel !== undefined)
    runtimeUpdates.governance_level = updates.governanceLevel;
  if (updates.engineTag !== undefined) runtimeUpdates.engine_tag = updates.engineTag;
  if (updates.featureFlags !== undefined)
    runtimeUpdates.feature_flags = updates.featureFlags ? JSON.stringify(updates.featureFlags) : null;
  if (updates.identityConfig !== undefined)
    runtimeUpdates.identity_config = updates.identityConfig ? JSON.stringify(updates.identityConfig) : null;
  if (updates.dataPolicy !== undefined)
    runtimeUpdates.data_policy = updates.dataPolicy ? JSON.stringify(updates.dataPolicy) : null;
  if (updates.ownershipModel !== undefined)
    runtimeUpdates.ownership_model = updates.ownershipModel;
  if (updates.mutability !== undefined)
    runtimeUpdates.mutability = updates.mutability;

  // Display metadata → entity_ui_profile
  const uiUpdates: Record<string, unknown> = {};
  if (updates.labelSingular !== undefined) uiUpdates.label_singular = updates.labelSingular;
  if (updates.labelPlural !== undefined) uiUpdates.label_plural = updates.labelPlural;
  if (updates.description !== undefined) uiUpdates.description = updates.description;
  if (updates.iconKey !== undefined) uiUpdates.icon_key = updates.iconKey;
  if (updates.colorToken !== undefined) uiUpdates.color_token = updates.colorToken;
  if (updates.displayConfig !== undefined)
    uiUpdates.display_config = updates.displayConfig ? JSON.stringify(updates.displayConfig) : null;

  // Numbering → entity_numbering_policy
  const numberingUpdates: Record<string, unknown> = {};
  if (updates.namingPolicy !== undefined)
    numberingUpdates.naming_policy = updates.namingPolicy ? JSON.stringify(updates.namingPolicy) : null;

  // Provenance → entity_publish_state
  const provenanceUpdate = updates.provenance !== undefined
    ? (updates.provenance ? JSON.stringify(updates.provenance) : null)
    : undefined;

  // ── Evolution guard: check immutable columns before touching the DB ──
  const { checkEvolutionGuard, ENTITY_UPDATE_KEY_TO_COLUMN } = await import("@/lib/entity-meta-utils");

  const changingColumns = Object.keys(dbUpdates)
    .filter((k) => k !== "updated_at");

  if (changingColumns.length > 0) {
    // Check if any published version exists
    const entity = await db
      .selectFrom("meta.entity")
      .select(["id"])
      .where("name", "=", entityName)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (entity) {
      const published = await db
        .selectFrom("meta.entity_version")
        .select(["id"])
        .where("entity_id", "=", entity.id)
        .where("status", "=", "published")
        .limit(1)
        .executeTakeFirst();

      const guard = checkEvolutionGuard(changingColumns, !!published);
      if (!guard.allowed) {
        return { success: false, data: null, error: guard.reason };
      }
    }
  }

  const entity = await db
    .updateTable("meta.entity")
    .set(dbUpdates as any)
    .where("name", "=", entityName)
    .where("tenant_id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();

  if (!entity) return { success: false, data: null };

  // Write satellite table updates in parallel
  const satelliteWrites: Promise<unknown>[] = [];

  if (Object.keys(runtimeUpdates).length > 0) {
    satelliteWrites.push(
      db
        .updateTable("meta.entity_runtime_profile" as any)
        .set({ ...runtimeUpdates, updated_at: new Date() } as any)
        .where("entity_id", "=", entity.id)
        .execute(),
    );
  }

  if (Object.keys(uiUpdates).length > 0) {
    satelliteWrites.push(
      db
        .updateTable("meta.entity_ui_profile" as any)
        .set({ ...uiUpdates, updated_at: new Date() } as any)
        .where("entity_id", "=", entity.id)
        .execute(),
    );
  }

  if (Object.keys(numberingUpdates).length > 0) {
    satelliteWrites.push(
      db
        .updateTable("meta.entity_numbering_policy" as any)
        .set({ ...numberingUpdates, updated_at: new Date() } as any)
        .where("entity_id", "=", entity.id)
        .execute(),
    );
  }

  if (provenanceUpdate !== undefined) {
    satelliteWrites.push(
      db
        .updateTable("meta.entity_publish_state" as any)
        .set({ provenance: provenanceUpdate, updated_at: new Date() } as any)
        .where("entity_id", "=", entity.id)
        .execute(),
    );
  }

  if (satelliteWrites.length > 0) {
    await Promise.all(satelliteWrites);
  }

  return getEntityDirect(entity.name, tenantId);
}

/**
 * Delete an entity from meta.entity by name.
 */
export async function deleteEntityDirect(
  entityName: string,
  tenantId: string,
): Promise<{ success: boolean }> {
  const db = await getDb();
  await db.deleteFrom("meta.entity").where("name", "=", entityName).where("tenant_id", "=", tenantId).execute();
  return { success: true };
}

// ─── Sub-resource Queries ────────────────────────────────────

async function resolveLatestVersionId(
  entityName: string,
  tenantId: string,
): Promise<{ entityId: string; versionId: string } | null> {
  const db = await getDb();
  const entity = await db
    .selectFrom("meta.entity")
    .select(["id"])
    .where("name", "=", entityName)
    .where("tenant_id", "=", tenantId)
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

export async function listFieldsDirect(entityName: string, tenantId: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName, tenantId);
  if (!resolved) return { success: false, data: [], hasPublishedVersion: false };

  const [rows, publishedVersion] = await Promise.all([
    db
      .selectFrom("meta.field")
      .selectAll()
      .where("entity_version_id", "=", resolved.versionId)
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("meta.entity_version")
      .select(["id"])
      .where("entity_id", "=", resolved.entityId)
      .where("status", "=", "published")
      .limit(1)
      .executeTakeFirst(),
  ]);

  return {
    success: true,
    data: rows.map(mapField),
    hasPublishedVersion: !!publishedVersion,
  };
}

/**
 * Ensures a draft version exists for the entity. Creates one if missing.
 * Returns the resolved { entityId, versionId }.
 */
async function ensureDraftVersion(
  entityName: string,
  tenantId: string,
): Promise<{ entityId: string; versionId: string }> {
  const db = await getDb();
  const entity = await db
    .selectFrom("meta.entity")
    .select(["id"])
    .where("name", "=", entityName)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!entity) throw new Error(`Entity '${entityName}' not found`);

  const existing = await db
    .selectFrom("meta.entity_version")
    .select(["id"])
    .where("entity_id", "=", entity.id as string)
    .orderBy("version_no", "desc")
    .limit(1)
    .executeTakeFirst();
  if (existing) return { entityId: entity.id as string, versionId: existing.id as string };

  // Auto-create first draft version
  const version = await db
    .insertInto("meta.entity_version")
    .values({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: entity.id as string,
      version_no: 1,
      status: "draft",
      created_by: "admin",
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { entityId: entity.id as string, versionId: version.id as string };
}

/**
 * Create a new field in meta.field for the entity's draft version.
 */
export async function createFieldDirect(
  entityName: string,
  data: Record<string, unknown>,
  tenantId: string,
): Promise<{ success: boolean; data: unknown }> {
  const db = await getDb();
  const { versionId } = await ensureDraftVersion(entityName, tenantId);

  // Determine next sort order
  const lastField = await db
    .selectFrom("meta.field")
    .select(["sort_order"])
    .where("entity_version_id", "=", versionId)
    .orderBy("sort_order", "desc")
    .limit(1)
    .executeTakeFirst();
  const nextOrder = ((lastField as any)?.sort_order ?? -1) + 1;

  const row = await db
    .insertInto("meta.field")
    .values({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_version_id: versionId,
      name: data.name as string,
      column_name: (data.columnName as string) || (data.name as string),
      data_type: data.dataType as string,
      ui_type: (data.uiType as string) ?? null,
      is_required: (data.isRequired as boolean) ?? false,
      is_unique: (data.isUnique as boolean) ?? false,
      is_searchable: (data.isSearchable as boolean) ?? false,
      is_filterable: (data.isFilterable as boolean) ?? false,
      default_value: data.defaultValue ? JSON.stringify(data.defaultValue) : null,
      validation: data.validationJson ? JSON.stringify(
        typeof data.validationJson === "string" ? JSON.parse(data.validationJson as string) : data.validationJson,
      ) : null,
      format: (data.format as string) ?? null,
      unit: (data.unit as string) || null,
      cardinality: (data.cardinality as string) ?? "one",
      ui_hint: data.uiHint ? JSON.stringify(data.uiHint) : null,
      is_read_only: (data.isReadOnly as boolean) ?? false,
      visibility: data.visibility ? JSON.stringify(data.visibility) : null,
      editability: data.editability ? JSON.stringify(data.editability) : null,
      sort_order: nextOrder,
      created_by: "admin",
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();

  return { success: true, data: mapField(row) };
}

/**
 * Update an existing field in meta.field by field ID.
 */
export async function updateFieldDirect(
  entityName: string,
  fieldId: string,
  data: Record<string, unknown>,
  tenantId: string,
): Promise<{ success: boolean; data: unknown }> {
  const db = await getDb();

  const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: "admin" };
  if (data.name !== undefined) updates.name = data.name;
  if (data.columnName !== undefined) updates.column_name = data.columnName;
  if (data.dataType !== undefined) updates.data_type = data.dataType;
  if (data.uiType !== undefined) updates.ui_type = data.uiType;
  if (data.isRequired !== undefined) updates.is_required = data.isRequired;
  if (data.isUnique !== undefined) updates.is_unique = data.isUnique;
  if (data.isSearchable !== undefined) updates.is_searchable = data.isSearchable;
  if (data.isFilterable !== undefined) updates.is_filterable = data.isFilterable;
  if (data.format !== undefined) updates.format = data.format;
  if (data.unit !== undefined) updates.unit = data.unit || null;
  if (data.cardinality !== undefined) updates.cardinality = data.cardinality;
  if (data.isReadOnly !== undefined) updates.is_read_only = data.isReadOnly;
  if (data.uiHint !== undefined) updates.ui_hint = data.uiHint ? JSON.stringify(data.uiHint) : null;
  if (data.visibility !== undefined) updates.visibility = data.visibility ? JSON.stringify(data.visibility) : null;
  if (data.editability !== undefined) updates.editability = data.editability ? JSON.stringify(data.editability) : null;
  if (data.defaultValue !== undefined) updates.default_value = data.defaultValue ? JSON.stringify(data.defaultValue) : null;
  if (data.validationJson !== undefined) {
    const val = data.validationJson;
    updates.validation = val ? JSON.stringify(typeof val === "string" ? JSON.parse(val as string) : val) : null;
  }

  const row = await db
    .updateTable("meta.field")
    .set(updates as any)
    .where("id", "=", fieldId)
    .where("tenant_id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();

  if (!row) return { success: false, data: null };
  return { success: true, data: mapField(row) };
}

/**
 * Toggle the is_deprecated flag on a field.
 */
export async function deprecateFieldDirect(
  fieldId: string,
  isDeprecated: boolean,
  tenantId: string,
): Promise<{ success: boolean; data: unknown }> {
  const db = await getDb();
  const row = await db
    .updateTable("meta.field")
    .set({ is_deprecated: isDeprecated, updated_at: new Date(), updated_by: "admin" } as any)
    .where("id", "=", fieldId)
    .where("tenant_id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();
  if (!row) return { success: false, data: null };
  return { success: true, data: mapField(row) };
}

/**
 * Delete a field from meta.field by field ID.
 * Blocks deletion if the entity has any published version (use deprecate instead).
 */
export async function deleteFieldDirect(
  fieldId: string,
  tenantId: string,
): Promise<{ success: boolean; error?: { code: string; message: string } }> {
  const db = await getDb();

  // Look up the field's entity to check for published versions
  const field = await db
    .selectFrom("meta.field")
    .select(["entity_version_id"])
    .where("id", "=", fieldId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!field) return { success: false, error: { code: "NOT_FOUND", message: "Field not found" } };

  const version = await db
    .selectFrom("meta.entity_version")
    .select(["entity_id"])
    .where("id", "=", (field as any).entity_version_id)
    .executeTakeFirst();
  if (version) {
    const published = await db
      .selectFrom("meta.entity_version")
      .select(["id"])
      .where("entity_id", "=", (version as any).entity_id)
      .where("status", "=", "published")
      .limit(1)
      .executeTakeFirst();
    if (published) {
      return {
        success: false,
        error: {
          code: "PUBLISHED_GUARD",
          message: "Cannot delete a field from an entity with published versions. Use deprecate instead.",
        },
      };
    }
  }

  const result = await db
    .deleteFrom("meta.field")
    .where("id", "=", fieldId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  return { success: (result.numDeletedRows ?? 0n) > 0n };
}

/**
 * Reorder fields by updating sort_order for the given field IDs.
 */
export async function reorderFieldsDirect(
  entityName: string,
  fieldIds: string[],
  tenantId: string,
): Promise<{ success: boolean }> {
  const db = await getDb();
  for (let i = 0; i < fieldIds.length; i++) {
    await db
      .updateTable("meta.field")
      .set({ sort_order: i, updated_at: new Date(), updated_by: "admin" } as any)
      .where("id", "=", fieldIds[i])
      .where("tenant_id", "=", tenantId)
      .execute();
  }
  return { success: true };
}

export async function listRelationsDirect(entityName: string, tenantId: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName, tenantId);
  if (!resolved) return { success: false, data: [] };
  const rows = await db
    .selectFrom("meta.relation")
    .selectAll()
    .where("entity_version_id", "=", resolved.versionId)
    .execute();
  return { success: true, data: rows.map(mapRelation) };
}

export async function listIndexesDirect(entityName: string, tenantId: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName, tenantId);
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

export async function listVersionsDirect(entityName: string, tenantId: string) {
  const db = await getDb();
  const entity = await db
    .selectFrom("meta.entity")
    .select(["id"])
    .where("name", "=", entityName)
    .where("tenant_id", "=", tenantId)
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

export async function getPoliciesDirect(entityName: string, tenantId: string) {
  const db = await getDb();
  const entity = await db
    .selectFrom("meta.entity")
    .select(["id"])
    .where("name", "=", entityName)
    .where("tenant_id", "=", tenantId)
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

export async function getCompiledDirect(entityName: string, tenantId: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName, tenantId);
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

/**
 * Fetch the data needed for publish-time cross-entity consistency checks.
 * Returns null if the entity or version doesn't exist.
 */
export async function fetchPublishValidationData(
  entityName: string,
  versionId: string,
  tenantId: string,
): Promise<{
  entityName: string;
  entityClass: string;
  governanceLevel: string;
  featureFlags: Record<string, unknown> | null;
  namingPolicy: unknown | null;
  displayConfig: Record<string, unknown> | null;
  entityCode: string | null;
  slug: string | null;
  backingType: string;
  mappingMode: string;
  hasCompiledArtifact: boolean;
  hasLifecycleBinding: boolean;
  hasActiveOverlays: boolean;
  overlayConflictModes: string[];
  hasFieldSecurityPolicies: boolean;
  fieldNames: Set<string>;
} | null> {
  const db = await getDb();

  const entity = await db
    .selectFrom("meta.entity")
    .selectAll()
    .where("name", "=", entityName)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (!entity) return null;

  const e = entity as any;

  // Run all lookups in parallel (including satellite tables)
  const [compiled, lifecycleBindings, overlays, numberingPolicy, runtimeProfile, displayConfig, fieldSecurityPolicies, versionFields] = await Promise.all([
    db
      .selectFrom("meta.entity_compiled")
      .select(["id"])
      .where("entity_version_id", "=", versionId)
      .limit(1)
      .executeTakeFirst(),
    db
      .selectFrom("meta.entity_lifecycle" as any)
      .select(["id"])
      .where("entity_name", "=", entityName)
      .limit(1)
      .executeTakeFirst(),
    db
      .selectFrom("meta.overlay" as any)
      .select(["id", "conflict_mode"])
      .where("base_entity_id", "=", entity.id)
      .where("is_active", "=", true)
      .execute(),
    db
      .selectFrom("meta.entity_numbering_policy" as any)
      .select(["naming_policy"])
      .where("entity_id", "=", entity.id)
      .executeTakeFirst() as Promise<any>,
    db
      .selectFrom("meta.entity_runtime_profile" as any)
      .select(["feature_flags", "governance_level"])
      .where("entity_id", "=", entity.id)
      .executeTakeFirst() as Promise<any>,
    db
      .selectFrom("meta.entity_ui_profile" as any)
      .select(["display_config"])
      .where("entity_id", "=", entity.id)
      .executeTakeFirst() as Promise<any>,
    db
      .selectFrom("meta.field_security_policy" as any)
      .select(["id"])
      .where("entity_id", "=", entity.id)
      .limit(1)
      .executeTakeFirst() as Promise<any>,
    db
      .selectFrom("meta.field" as any)
      .select(["name"])
      .where("entity_version_id", "=", versionId)
      .execute() as Promise<any[]>,
  ]);

  return {
    entityName,
    entityClass: e.entity_class ?? "REFERENCE",
    governanceLevel: runtimeProfile?.governance_level ?? e.governance_level ?? "full",
    featureFlags: runtimeProfile?.feature_flags ?? e.feature_flags ?? null,
    namingPolicy: numberingPolicy?.naming_policy ?? null,
    displayConfig: displayConfig?.display_config ?? null,
    entityCode: e.entity_code ?? null,
    slug: e.slug ?? null,
    backingType: e.backing_type ?? "table",
    mappingMode: e.mapping_mode ?? "exclusive",
    hasCompiledArtifact: !!compiled,
    hasLifecycleBinding: !!lifecycleBindings,
    hasActiveOverlays: (overlays as any[]).length > 0,
    overlayConflictModes: (overlays as any[]).map((o: any) => o.conflict_mode ?? ""),
    hasFieldSecurityPolicies: !!fieldSecurityPolicies,
    fieldNames: new Set((versionFields ?? []).map((f: any) => f.name as string)),
  };
}

export async function getValidationDirect(entityName: string, tenantId: string) {
  const db = await getDb();
  const resolved = await resolveLatestVersionId(entityName, tenantId);
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
