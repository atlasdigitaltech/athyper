/**
 * META Registry Service Implementation
 *
 * PostgreSQL-backed implementation of MetaRegistry interface.
 * Manages entity definitions and versions using Kysely for type-safe queries.
 */

import type { DB } from "@athyper/adapter-db";
import type {
  Entity,
  EntitySchema,
  EntityVersion,
  EntityVersionSummary,
  ListOptions,
  MetaRegistry,
  PaginatedResponse,
  RequestContext,
} from "@athyper/core/meta";
import type { Kysely } from "kysely";

/**
 * META Registry Service
 * Implements CRUD operations for entities and versions
 */
export class MetaRegistryService implements MetaRegistry {
  constructor(private readonly db: Kysely<DB>) {}

  // =========================================================================
  // Entity Management
  // =========================================================================

  async createEntity(
    name: string,
    description: string | undefined,
    ctx: RequestContext,
    options?: {
      kind?: string;
      moduleId?: string;
      tableSchema?: string;
      tableName?: string;
      governanceLevel?: string;
      engineTag?: string;
    },
  ): Promise<Entity> {
    const entity = await this.db
      .insertInto("meta.entity")
      .values({
        id: crypto.randomUUID(),
        tenant_id: ctx.tenantId ?? "default",
        module_id: options?.moduleId ?? "default",
        name,
        description: description ?? null,
        kind: options?.kind ?? "ent",
        table_schema: options?.tableSchema ?? "ent",
        table_name: options?.tableName ?? name,
        governance_level: options?.governanceLevel ?? "full",
        engine_tag: options?.engineTag ?? null,
        created_by: ctx.userId,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapEntityFromDb(entity);
  }

  async getEntity(name: string): Promise<Entity | undefined> {
    const entity = await this.db
      .selectFrom("meta.entity")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();

    if (!entity) return undefined;

    // Enrich with version info and counts
    return this.enrichEntity(this.mapEntityFromDb(entity));
  }

  async listEntities(
    options: ListOptions = {},
  ): Promise<PaginatedResponse<Entity>> {
    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? 100, 200);
    const offset = (page - 1) * pageSize;

    // Build query
    let query = this.db.selectFrom("meta.entity").selectAll();

    // Apply ordering
    const orderBy = options.orderBy ?? "created_at";
    const orderDir = options.orderDir ?? "desc";
    query = query.orderBy(orderBy as any, orderDir);

    // Execute count and data queries
    const [countResult, data] = await Promise.all([
      this.db
        .selectFrom("meta.entity")
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow(),
      query.limit(pageSize).offset(offset).execute(),
    ]);

    const total = Number(countResult.count);
    const totalPages = Math.ceil(total / pageSize);

    // Map entities
    const entities = data.map((e) => this.mapEntityFromDb(e));

    // Enrich with version info and field/relation counts
    const enrichedEntities = await this.enrichEntities(entities);

    return {
      data: enrichedEntities,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async updateEntity(
    name: string,
    updates: Partial<Pick<Entity, "description" | "activeVersion">>,
    _ctx: RequestContext,
  ): Promise<Entity> {
    const dbUpdates: any = {};

    if (updates.description !== undefined) {
      dbUpdates.description = updates.description;
    }

    const entity = await this.db
      .updateTable("meta.entity")
      .set(dbUpdates as any)
      .where("name", "=", name)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapEntityFromDb(entity);
  }

  async deleteEntity(name: string, _ctx: RequestContext): Promise<void> {
    await this.db.deleteFrom("meta.entity").where("name", "=", name).execute();
  }

  // =========================================================================
  // Version Management
  // =========================================================================

  async createVersion(
    entityName: string,
    version: string,
    schema: EntitySchema,
    ctx: RequestContext,
  ): Promise<EntityVersion> {
    // Look up entity ID from entity name
    const entityRecord = await this.getEntity(entityName);
    const entityId = entityRecord?.id ?? entityName;

    const entityVersion = await this.db
      .insertInto("meta.entity_version")
      .values({
        id: crypto.randomUUID(),
        tenant_id: ctx.tenantId ?? "default",
        entity_id: entityId,
        version_no: parseInt(version, 10) || 1,
        status: "draft",
        label: version,
        behaviors: JSON.stringify(schema),
        created_by: ctx.userId,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapVersionFromDb(entityVersion);
  }

  async getVersion(
    entityName: string,
    version: string,
  ): Promise<EntityVersion | undefined> {
    const entity = await this.getEntity(entityName);
    if (!entity) return undefined;

    const entityVersion = await this.db
      .selectFrom("meta.entity_version")
      .selectAll()
      .where("entity_id", "=", entity.id)
      .where("label", "=", version)
      .executeTakeFirst();

    return entityVersion ? this.mapVersionFromDb(entityVersion) : undefined;
  }

  async getActiveVersion(
    entityName: string,
  ): Promise<EntityVersion | undefined> {
    const entity = await this.getEntity(entityName);
    if (!entity) return undefined;

    const entityVersion = await this.db
      .selectFrom("meta.entity_version")
      .selectAll()
      .where("entity_id", "=", entity.id)
      .where("status", "=", "active")
      .executeTakeFirst();

    return entityVersion ? this.mapVersionFromDb(entityVersion) : undefined;
  }

  async listVersions(
    entityName: string,
    options: ListOptions = {},
  ): Promise<PaginatedResponse<EntityVersion>> {
    const entity = await this.getEntity(entityName);
    const entityId = entity?.id ?? entityName;

    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? 20, 100);
    const offset = (page - 1) * pageSize;

    // Build query
    let query = this.db
      .selectFrom("meta.entity_version")
      .selectAll()
      .where("entity_id", "=", entityId);

    // Apply ordering
    const orderBy = options.orderBy ?? "created_at";
    const orderDir = options.orderDir ?? "desc";
    query = query.orderBy(orderBy as any, orderDir);

    // Execute count and data queries
    const [countResult, data] = await Promise.all([
      this.db
        .selectFrom("meta.entity_version")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("entity_id", "=", entityId)
        .executeTakeFirstOrThrow(),
      query.limit(pageSize).offset(offset).execute(),
    ]);

    const total = Number(countResult.count);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data: data.map((v) => this.mapVersionFromDb(v)),
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async activateVersion(
    entityName: string,
    version: string,
    _ctx: RequestContext,
  ): Promise<EntityVersion> {
    const entity = await this.getEntity(entityName);
    const entityId = entity?.id ?? entityName;

    // Deactivate all versions for this entity
    await this.db
      .updateTable("meta.entity_version")
      .set({ status: "inactive" } as any)
      .where("entity_id", "=", entityId)
      .execute();

    // Activate the specified version
    const entityVersion = await this.db
      .updateTable("meta.entity_version")
      .set({ status: "active" } as any)
      .where("entity_id", "=", entityId)
      .where("label", "=", version)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapVersionFromDb(entityVersion);
  }

  async deactivateVersion(
    entityName: string,
    version: string,
    _ctx: RequestContext,
  ): Promise<EntityVersion> {
    const entity = await this.getEntity(entityName);
    const entityId = entity?.id ?? entityName;

    const entityVersion = await this.db
      .updateTable("meta.entity_version")
      .set({ status: "inactive" } as any)
      .where("entity_id", "=", entityId)
      .where("label", "=", version)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapVersionFromDb(entityVersion);
  }

  async updateVersion(
    entityName: string,
    version: string,
    schema: EntitySchema,
    _ctx: RequestContext,
  ): Promise<EntityVersion> {
    const entity = await this.getEntity(entityName);
    const entityId = entity?.id ?? entityName;

    const entityVersion = await this.db
      .updateTable("meta.entity_version")
      .set({ behaviors: JSON.stringify(schema) } as any)
      .where("entity_id", "=", entityId)
      .where("label", "=", version)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapVersionFromDb(entityVersion);
  }

  async deleteVersion(
    entityName: string,
    version: string,
    _ctx: RequestContext,
  ): Promise<void> {
    const entity = await this.getEntity(entityName);
    const entityId = entity?.id ?? entityName;

    await this.db
      .deleteFrom("meta.entity_version")
      .where("entity_id", "=", entityId)
      .where("label", "=", version)
      .execute();
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private mapEntityFromDb(dbEntity: any): Entity {
    return {
      id: dbEntity.id,
      name: dbEntity.name,
      description: dbEntity.description ?? undefined,
      kind: dbEntity.kind ?? "ent",
      moduleId: dbEntity.module_id ?? null,
      tableSchema: dbEntity.table_schema ?? "ent",
      tableName: dbEntity.table_name ?? dbEntity.name,
      isActive: dbEntity.is_active ?? true,
      governanceLevel: dbEntity.governance_level ?? "full",
      engineTag: dbEntity.engine_tag ?? null,
      activeVersion: dbEntity.active_version ?? undefined,
      createdAt: new Date(dbEntity.created_at),
      updatedAt: dbEntity.updated_at
        ? new Date(dbEntity.updated_at)
        : new Date(dbEntity.created_at),
      createdBy: dbEntity.created_by,
    };
  }

  /**
   * Enrich a single entity with version info and field/relation counts.
   */
  private async enrichEntity(entity: Entity): Promise<Entity> {
    const enriched = await this.enrichEntities([entity]);
    return enriched[0];
  }

  /**
   * Enrich a list of entities with current version, field count, and relation count.
   * Uses batch queries for efficiency.
   */
  private async enrichEntities(entities: Entity[]): Promise<Entity[]> {
    if (entities.length === 0) return [];

    const entityIds = entities.map((e) => e.id);

    // Fetch all versions for these entities (ordered by version_no desc)
    const versions = await this.db
      .selectFrom("meta.entity_version")
      .selectAll()
      .where("entity_id", "in", entityIds)
      .orderBy("version_no", "desc")
      .execute();

    // Group versions by entity_id, take first (latest) for each
    const latestVersionByEntity = new Map<string, any>();
    for (const v of versions) {
      if (!latestVersionByEntity.has(v.entity_id as string)) {
        latestVersionByEntity.set(v.entity_id as string, v);
      }
    }

    // Collect version IDs for field/relation count queries
    const versionIds = [...latestVersionByEntity.values()].map(
      (v) => v.id as string,
    );

    // Batch fetch field and relation counts
    const [fieldCountRows, relationCountRows] =
      versionIds.length > 0
        ? await Promise.all([
            this.db
              .selectFrom("meta.field")
              .select("entity_version_id")
              .select((eb) => eb.fn.countAll().as("count"))
              .where("entity_version_id", "in", versionIds)
              .groupBy("entity_version_id")
              .execute(),
            this.db
              .selectFrom("meta.relation")
              .select("entity_version_id")
              .select((eb) => eb.fn.countAll().as("count"))
              .where("entity_version_id", "in", versionIds)
              .groupBy("entity_version_id")
              .execute(),
          ])
        : [[], []];

    // Build lookup maps
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

    // Enrich each entity
    return entities.map((entity) => {
      const latestVersion = latestVersionByEntity.get(entity.id);

      const currentVersion: EntityVersionSummary | null = latestVersion
        ? {
            id: latestVersion.id,
            versionNo: latestVersion.version_no ?? 1,
            status: latestVersion.status ?? "draft",
            label: latestVersion.label ?? null,
            publishedAt: latestVersion.published_at
              ? new Date(latestVersion.published_at)
              : null,
            publishedBy: latestVersion.published_by ?? null,
            createdAt: new Date(latestVersion.created_at),
          }
        : null;

      const versionId = latestVersion?.id as string | undefined;
      const fieldCount = versionId
        ? (fieldCountByVersion.get(versionId) ?? 0)
        : 0;
      const relationCount = versionId
        ? (relationCountByVersion.get(versionId) ?? 0)
        : 0;

      return {
        ...entity,
        currentVersion,
        fieldCount,
        relationCount,
      };
    });
  }

  private mapVersionFromDb(dbVersion: any): EntityVersion {
    const rawSchema = dbVersion.behaviors ?? dbVersion.schema;
    return {
      id: dbVersion.id,
      entityName: dbVersion.entity_name ?? dbVersion.entity_id,
      version: dbVersion.label ?? dbVersion.version,
      schema: typeof rawSchema === "string" ? JSON.parse(rawSchema) : rawSchema,
      isActive: dbVersion.is_active ?? dbVersion.status === "active",
      createdAt: new Date(dbVersion.created_at),
      createdBy: dbVersion.created_by,
    };
  }
}
