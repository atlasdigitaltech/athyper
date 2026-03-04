/**
 * Meta Schema Relationship Registry
 *
 * Loads entity relationships from the META schema system.
 * Provides the IRelationshipRegistry interface backed by meta schema data.
 */

import type {
  IRelationshipRegistry,
  EntityMetadata,
  EntityRelationship,
  Cardinality,
} from "./join-planner.js";
import type { Logger } from "../../../../../kernel/logger.js";

// ============================================================================
// Types for Meta Schema Integration
// ============================================================================

/**
 * Meta entity schema (simplified for query planning)
 */
export interface MetaEntitySchema {
  id: string;
  entityKey: string;
  tableName: string;
  fields: MetaFieldSchema[];
  relations: MetaRelationSchema[];
}

/**
 * Meta field schema
 */
export interface MetaFieldSchema {
  fieldKey: string;
  columnName: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesEntity?: string;
  referencesField?: string;
}

/**
 * Meta relation schema
 */
export interface MetaRelationSchema {
  relationKey: string;
  sourceField: string;
  targetEntity: string;
  targetField: string;
  cardinality: Cardinality;
  isVirtual?: boolean;
}

/**
 * Interface for loading meta schemas
 */
export interface IMetaSchemaLoader {
  /** Load entity schema by key */
  loadEntity(entityKey: string, tenantId: string): Promise<MetaEntitySchema | null>;

  /** Load all entity schemas for tenant */
  loadAllEntities(tenantId: string): Promise<MetaEntitySchema[]>;
}

// ============================================================================
// Meta Schema Relationship Registry
// ============================================================================

/**
 * Relationship registry backed by META schema.
 * Caches entity metadata and relationships for efficient query planning.
 */
export class MetaSchemaRelationshipRegistry implements IRelationshipRegistry {
  private entityCache = new Map<string, EntityMetadata>();
  private relationshipCache = new Map<string, EntityRelationship[]>();
  private cacheExpiry = new Map<string, number>();
  private cacheTtlMs: number;

  constructor(
    private schemaLoader: IMetaSchemaLoader,
    private tenantId: string,
    private logger: Logger,
    options?: { cacheTtlMs?: number }
  ) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 60000; // 1 minute default
  }

  /**
   * Get entity metadata
   */
  async getEntity(entityName: string): Promise<EntityMetadata | undefined> {
    // Check cache
    const cached = this.getCachedEntity(entityName);
    if (cached) return cached;

    // Load from meta schema
    const metaEntity = await this.schemaLoader.loadEntity(entityName, this.tenantId);
    if (!metaEntity) return undefined;

    // Convert to EntityMetadata
    const metadata = this.convertToEntityMetadata(metaEntity);

    // Cache it
    this.cacheEntity(entityName, metadata);

    return metadata;
  }

  /**
   * Get all registered entities
   */
  async getAllEntities(): Promise<EntityMetadata[]> {
    const metaEntities = await this.schemaLoader.loadAllEntities(this.tenantId);
    const entities: EntityMetadata[] = [];

    for (const metaEntity of metaEntities) {
      const metadata = this.convertToEntityMetadata(metaEntity);
      this.cacheEntity(metaEntity.entityKey, metadata);
      entities.push(metadata);
    }

    return entities;
  }

  /**
   * Get relationship between two entities
   */
  async getRelationship(
    sourceEntity: string,
    targetEntity: string
  ): Promise<EntityRelationship | undefined> {
    const relationships = await this.getEntityRelationships(sourceEntity);
    return relationships.find((r) => r.targetEntity === targetEntity);
  }

  /**
   * Get all relationships for an entity
   */
  async getEntityRelationships(entityName: string): Promise<EntityRelationship[]> {
    // Check cache
    const cachedRels = this.getCachedRelationships(entityName);
    if (cachedRels) return cachedRels;

    // Load entity to get relationships
    const entity = await this.getEntity(entityName);
    if (!entity) return [];

    // Relationships are part of entity metadata
    const relationships = entity.relationships;

    // Cache relationships
    this.cacheRelationships(entityName, relationships);

    return relationships;
  }

  /**
   * Check if a join path is valid
   */
  async isJoinAllowed(sourceEntity: string, targetEntity: string): Promise<boolean> {
    const relationship = await this.getRelationship(sourceEntity, targetEntity);
    return relationship !== undefined;
  }

  /**
   * Get joinable entities from a given entity
   */
  async getJoinableEntities(entityName: string): Promise<string[]> {
    const relationships = await this.getEntityRelationships(entityName);
    return [...new Set(relationships.map((r) => r.targetEntity))];
  }

  /**
   * Refresh cache for an entity
   */
  async refreshEntity(entityName: string): Promise<void> {
    this.invalidateCache(entityName);
    await this.getEntity(entityName);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.entityCache.clear();
    this.relationshipCache.clear();
    this.cacheExpiry.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Convert meta schema to EntityMetadata
   */
  private convertToEntityMetadata(metaEntity: MetaEntitySchema): EntityMetadata {
    // Extract field names
    const fields = metaEntity.fields.map((f) => f.fieldKey);

    // Extract primary key(s)
    const primaryKey = metaEntity.fields
      .filter((f) => f.isPrimaryKey)
      .map((f) => f.fieldKey);

    // Extract foreign keys
    const foreignKeys = metaEntity.fields
      .filter((f) => f.isForeignKey && f.referencesEntity)
      .map((f) => ({
        field: f.fieldKey,
        referencesEntity: f.referencesEntity!,
        referencesField: f.referencesField ?? "id",
      }));

    // Convert relations to EntityRelationship
    const relationships: EntityRelationship[] = metaEntity.relations.map((r) => ({
      sourceEntity: metaEntity.entityKey,
      sourceField: r.sourceField,
      targetEntity: r.targetEntity,
      targetField: r.targetField,
      cardinality: r.cardinality,
      name: r.relationKey,
      isVirtual: r.isVirtual,
    }));

    // Also create implicit relationships from foreign keys
    for (const fk of foreignKeys) {
      const existingRel = relationships.find(
        (r) => r.targetEntity === fk.referencesEntity && r.sourceField === fk.field
      );

      if (!existingRel) {
        relationships.push({
          sourceEntity: metaEntity.entityKey,
          sourceField: fk.field,
          targetEntity: fk.referencesEntity,
          targetField: fk.referencesField,
          cardinality: "many-to-one",
          name: `${fk.field}_ref`,
        });
      }
    }

    return {
      name: metaEntity.entityKey,
      tableName: metaEntity.tableName,
      fields,
      primaryKey,
      foreignKeys,
      relationships,
    };
  }

  /**
   * Get cached entity if valid
   */
  private getCachedEntity(entityName: string): EntityMetadata | undefined {
    const expiry = this.cacheExpiry.get(`entity:${entityName}`);
    if (!expiry || Date.now() > expiry) {
      return undefined;
    }
    return this.entityCache.get(entityName);
  }

  /**
   * Cache entity metadata
   */
  private cacheEntity(entityName: string, metadata: EntityMetadata): void {
    this.entityCache.set(entityName, metadata);
    this.cacheExpiry.set(`entity:${entityName}`, Date.now() + this.cacheTtlMs);
  }

  /**
   * Get cached relationships if valid
   */
  private getCachedRelationships(entityName: string): EntityRelationship[] | undefined {
    const expiry = this.cacheExpiry.get(`rels:${entityName}`);
    if (!expiry || Date.now() > expiry) {
      return undefined;
    }
    return this.relationshipCache.get(entityName);
  }

  /**
   * Cache relationships
   */
  private cacheRelationships(entityName: string, relationships: EntityRelationship[]): void {
    this.relationshipCache.set(entityName, relationships);
    this.cacheExpiry.set(`rels:${entityName}`, Date.now() + this.cacheTtlMs);
  }

  /**
   * Invalidate cache for entity
   */
  private invalidateCache(entityName: string): void {
    this.entityCache.delete(entityName);
    this.relationshipCache.delete(entityName);
    this.cacheExpiry.delete(`entity:${entityName}`);
    this.cacheExpiry.delete(`rels:${entityName}`);
  }
}

// ============================================================================
// Database Schema Loader
// ============================================================================

/**
 * Schema loader that reads from the meta schema database tables.
 * This is the production implementation.
 */
export class DatabaseMetaSchemaLoader implements IMetaSchemaLoader {
  constructor(
    private db: any, // Kysely<DB>
    private logger: Logger
  ) {}

  /**
   * Map relation_kind from DB to Cardinality type used by join planner
   */
  private mapRelationKindToCardinality(relationKind: string): Cardinality {
    switch (relationKind) {
      case "belongs_to": return "many-to-one";
      case "has_many": return "one-to-many";
      case "m2m": return "many-to-many";
      default: return "many-to-one";
    }
  }

  async loadEntity(entityKey: string, tenantId: string): Promise<MetaEntitySchema | null> {
    try {
      // Load entity + latest published version
      const entity = await this.db
        .selectFrom("meta.entity as e")
        .innerJoin("meta.entity_version as v", "v.entity_id", "e.id")
        .select([
          "e.id",
          "e.name",
          "e.table_name",
          "v.id as version_id",
        ])
        .where("e.name", "=", entityKey)
        .where("e.tenant_id", "=", tenantId)
        .where("v.status", "=", "published")
        .orderBy("v.version_no", "desc")
        .limit(1)
        .executeTakeFirst();

      if (!entity) return null;

      // Load fields from meta.field
      const fields = await this.db
        .selectFrom("meta.field")
        .select([
          "name",
          "column_name",
          "data_type",
        ])
        .where("entity_version_id", "=", entity.version_id)
        .where("is_active", "=", true)
        .execute();

      // Load relations from meta.relation
      const relations = await this.db
        .selectFrom("meta.relation")
        .select([
          "name",
          "relation_kind",
          "target_entity",
          "fk_field",
          "target_key",
        ])
        .where("entity_version_id", "=", entity.version_id)
        .execute();

      return {
        id: entity.id,
        entityKey: entity.name,
        tableName: entity.table_name,
        fields: fields.map((f: any) => ({
          fieldKey: f.name,
          columnName: f.column_name ?? f.name,
          dataType: f.data_type,
          isPrimaryKey: f.name === "id",
          isForeignKey: f.data_type === "reference",
          referencesEntity: undefined, // Resolved via relations
          referencesField: undefined,
        })),
        relations: relations.map((r: any) => ({
          relationKey: r.name,
          sourceField: r.fk_field ?? r.name,
          targetEntity: r.target_entity,
          targetField: r.target_key ?? "id",
          cardinality: this.mapRelationKindToCardinality(r.relation_kind),
          isVirtual: false,
        })),
      };
    } catch (error) {
      this.logger.error("Failed to load entity schema", { entityKey, tenantId, error });
      return null;
    }
  }

  async loadAllEntities(tenantId: string): Promise<MetaEntitySchema[]> {
    try {
      // Get all active entity names
      const entities = await this.db
        .selectFrom("meta.entity")
        .select("name")
        .where("tenant_id", "=", tenantId)
        .where("is_active", "=", true)
        .execute();

      const schemas: MetaEntitySchema[] = [];

      for (const entity of entities) {
        const schema = await this.loadEntity(entity.name, tenantId);
        if (schema) {
          schemas.push(schema);
        }
      }

      return schemas;
    } catch (error) {
      this.logger.error("Failed to load all entity schemas", { tenantId, error });
      return [];
    }
  }
}

// ============================================================================
// Static Schema Loader (for testing/configuration)
// ============================================================================

/**
 * Schema loader that uses static configuration.
 * Useful for testing or when meta schema is not available.
 */
export class StaticMetaSchemaLoader implements IMetaSchemaLoader {
  private schemas = new Map<string, MetaEntitySchema>();

  /**
   * Register a schema
   */
  registerSchema(schema: MetaEntitySchema): void {
    this.schemas.set(schema.entityKey, schema);
  }

  /**
   * Register multiple schemas
   */
  registerSchemas(schemas: MetaEntitySchema[]): void {
    for (const schema of schemas) {
      this.registerSchema(schema);
    }
  }

  async loadEntity(entityKey: string, _tenantId: string): Promise<MetaEntitySchema | null> {
    return this.schemas.get(entityKey) ?? null;
  }

  async loadAllEntities(_tenantId: string): Promise<MetaEntitySchema[]> {
    return Array.from(this.schemas.values());
  }
}
