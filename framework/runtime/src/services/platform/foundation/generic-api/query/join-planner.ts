/**
 * Join Planner
 *
 * Validates and plans joins based on declared relationships in meta schema.
 * Prevents arbitrary joins and enforces query guardrails.
 */

import { DEFAULT_GUARDRAILS, parseQualifiedField } from "./query-dsl.js";

import type {
  QueryRequest,
  JoinDefinition,
  QueryGuardrails,
  QueryValidationResult,
  QueryValidationError,
  QueryValidationWarning,
  JoinGraphNode,
} from "./query-dsl.js";
import type { Logger } from "../../../../../kernel/logger.js";

// ============================================================================
// Relationship Types
// ============================================================================

/**
 * Relationship cardinality
 */
export type Cardinality = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

/**
 * Declared relationship between entities
 */
export interface EntityRelationship {
  /** Source entity */
  sourceEntity: string;

  /** Source field (FK or relation field) */
  sourceField: string;

  /** Target entity */
  targetEntity: string;

  /** Target field (usually 'id') */
  targetField: string;

  /** Cardinality */
  cardinality: Cardinality;

  /** Relationship name (e.g., "orders", "customer") */
  name: string;

  /** Is this a virtual/computed relation */
  isVirtual?: boolean;
}

/**
 * Entity metadata for query planning
 */
export interface EntityMetadata {
  /** Entity name/key */
  name: string;

  /** Table name in database */
  tableName: string;

  /** Available fields */
  fields: string[];

  /** Primary key field(s) */
  primaryKey: string[];

  /** Foreign key fields */
  foreignKeys: Array<{
    field: string;
    referencesEntity: string;
    referencesField: string;
  }>;

  /** Declared relationships */
  relationships: EntityRelationship[];
}

// ============================================================================
// Relationship Registry Interface
// ============================================================================

/**
 * Interface for relationship registry
 * Implementations can load from meta schema, config, or in-memory
 */
export interface IRelationshipRegistry {
  /** Get entity metadata */
  getEntity(entityName: string): Promise<EntityMetadata | undefined>;

  /** Get all registered entities */
  getAllEntities(): Promise<EntityMetadata[]>;

  /** Get relationship between two entities */
  getRelationship(
    sourceEntity: string,
    targetEntity: string
  ): Promise<EntityRelationship | undefined>;

  /** Get all relationships for an entity */
  getEntityRelationships(entityName: string): Promise<EntityRelationship[]>;

  /** Check if a join path is valid */
  isJoinAllowed(sourceEntity: string, targetEntity: string): Promise<boolean>;

  /** Get joinable entities from a given entity */
  getJoinableEntities(entityName: string): Promise<string[]>;
}

// ============================================================================
// In-Memory Relationship Registry
// ============================================================================

/**
 * In-memory implementation of relationship registry.
 * Can be populated from meta schema or configuration.
 */
export class InMemoryRelationshipRegistry implements IRelationshipRegistry {
  private entities = new Map<string, EntityMetadata>();
  private relationships = new Map<string, EntityRelationship[]>();

  /**
   * Register an entity
   */
  registerEntity(entity: EntityMetadata): void {
    this.entities.set(entity.name, entity);

    // Index relationships
    for (const rel of entity.relationships) {
      const key = rel.sourceEntity;
      if (!this.relationships.has(key)) {
        this.relationships.set(key, []);
      }
      this.relationships.get(key)!.push(rel);
    }
  }

  /**
   * Register a relationship
   */
  registerRelationship(relationship: EntityRelationship): void {
    const key = relationship.sourceEntity;
    if (!this.relationships.has(key)) {
      this.relationships.set(key, []);
    }
    this.relationships.get(key)!.push(relationship);
  }

  async getEntity(entityName: string): Promise<EntityMetadata | undefined> {
    return this.entities.get(entityName);
  }

  async getAllEntities(): Promise<EntityMetadata[]> {
    return Array.from(this.entities.values());
  }

  async getRelationship(
    sourceEntity: string,
    targetEntity: string
  ): Promise<EntityRelationship | undefined> {
    const rels = this.relationships.get(sourceEntity) ?? [];
    return rels.find((r) => r.targetEntity === targetEntity);
  }

  async getEntityRelationships(entityName: string): Promise<EntityRelationship[]> {
    return this.relationships.get(entityName) ?? [];
  }

  async isJoinAllowed(sourceEntity: string, targetEntity: string): Promise<boolean> {
    const rel = await this.getRelationship(sourceEntity, targetEntity);
    return rel !== undefined;
  }

  async getJoinableEntities(entityName: string): Promise<string[]> {
    const rels = await this.getEntityRelationships(entityName);
    return [...new Set(rels.map((r) => r.targetEntity))];
  }
}

// ============================================================================
// Join Planner
// ============================================================================

/**
 * Planned join with resolved metadata
 */
export interface PlannedJoin {
  /** Join definition from request */
  definition: JoinDefinition;

  /** Source entity */
  sourceEntity: string;

  /** Source alias */
  sourceAlias: string;

  /** Target entity */
  targetEntity: string;

  /** Target table name */
  targetTable: string;

  /** Resolved relationship */
  relationship: EntityRelationship;

  /** Join depth (1 = direct join from base entity) */
  depth: number;
}

/**
 * Join plan result
 */
export interface JoinPlan {
  /** Base entity */
  baseEntity: string;

  /** Base table name */
  baseTable: string;

  /** Base alias */
  baseAlias: string;

  /** Planned joins in order */
  joins: PlannedJoin[];

  /** Join graph for visualization */
  joinGraph: JoinGraphNode[];

  /** Max depth reached */
  maxDepth: number;

  /** Validation warnings */
  warnings: QueryValidationWarning[];
}

/**
 * Join Planner - validates and plans joins for queries
 */
export class JoinPlanner {
  constructor(
    private registry: IRelationshipRegistry,
    private guardrails: QueryGuardrails = DEFAULT_GUARDRAILS,
    private logger: Logger
  ) {}

  /**
   * Validate and plan joins for a query
   */
  async planJoins(query: QueryRequest, _tenantId: string): Promise<{
    plan?: JoinPlan;
    validation: QueryValidationResult;
  }> {
    const errors: QueryValidationError[] = [];
    const warnings: QueryValidationWarning[] = [];

    // Validate base entity
    const baseEntity = await this.registry.getEntity(query.from);
    if (!baseEntity) {
      errors.push({
        code: "UNKNOWN_ENTITY",
        message: `Unknown entity: ${query.from}`,
        path: "from",
      });
      return { validation: { valid: false, errors, warnings } };
    }

    // Validate aliases
    const aliasSet = new Set<string>();
    const baseAlias = query.as ?? query.from.charAt(0).toLowerCase();

    aliasSet.add(baseAlias);

    // Check for duplicate aliases
    if (query.joins) {
      for (const join of query.joins) {
        if (aliasSet.has(join.as)) {
          errors.push({
            code: "DUPLICATE_ALIAS",
            message: `Duplicate alias: ${join.as}`,
            path: `joins`,
          });
        }
        aliasSet.add(join.as);
      }
    }

    // Validate number of joins
    const joinCount = query.joins?.length ?? 0;
    if (joinCount > this.guardrails.maxJoins) {
      errors.push({
        code: "MAX_JOINS_EXCEEDED",
        message: `Too many joins: ${joinCount} (max: ${this.guardrails.maxJoins})`,
        path: "joins",
      });
    }

    // Validate each join
    const plannedJoins: PlannedJoin[] = [];
    const aliasToEntity = new Map<string, string>();
    aliasToEntity.set(baseAlias, query.from);

    if (query.joins) {
      for (let i = 0; i < query.joins.length; i++) {
        const join = query.joins[i];
        const joinPath = `joins[${i}]`;

        // Validate join type
        if (!this.guardrails.allowedJoinTypes.includes(join.type)) {
          errors.push({
            code: "INVALID_JOIN",
            message: `Join type not allowed: ${join.type}`,
            path: joinPath,
          });
          continue;
        }

        // Parse join condition to find source alias
        const sourceAlias = this.extractSourceAliasFromCondition(join.on);
        if (!sourceAlias || !aliasToEntity.has(sourceAlias)) {
          errors.push({
            code: "INVALID_JOIN",
            message: `Invalid join condition: ${join.on}. Source alias not found.`,
            path: `${joinPath}.on`,
          });
          continue;
        }

        const sourceEntity = aliasToEntity.get(sourceAlias)!;

        // Validate target entity exists
        const targetEntity = await this.registry.getEntity(join.entity);
        if (!targetEntity) {
          errors.push({
            code: "UNKNOWN_ENTITY",
            message: `Unknown entity in join: ${join.entity}`,
            path: `${joinPath}.entity`,
          });
          continue;
        }

        // Validate join is allowed
        const relationship = await this.registry.getRelationship(sourceEntity, join.entity);
        if (!relationship) {
          errors.push({
            code: "JOIN_NOT_ALLOWED",
            message: `Join not allowed: ${sourceEntity} -> ${join.entity}. No declared relationship.`,
            path: `${joinPath}`,
          });
          continue;
        }

        // Calculate depth
        const depth = this.calculateJoinDepth(sourceAlias, plannedJoins, baseAlias);
        if (depth > this.guardrails.maxDepth) {
          errors.push({
            code: "MAX_DEPTH_EXCEEDED",
            message: `Join depth exceeded: ${depth} (max: ${this.guardrails.maxDepth})`,
            path: `${joinPath}`,
          });
          continue;
        }

        aliasToEntity.set(join.as, join.entity);

        plannedJoins.push({
          definition: join,
          sourceEntity,
          sourceAlias,
          targetEntity: join.entity,
          targetTable: targetEntity.tableName,
          relationship,
          depth,
        });
      }
    }

    // Validate SELECT fields
    if (query.select.length === 0) {
      errors.push({
        code: "SYNTAX_ERROR",
        message: "SELECT cannot be empty",
        path: "select",
      });
    }

    if (query.select.length > this.guardrails.maxSelectFields) {
      errors.push({
        code: "MAX_FIELDS_EXCEEDED",
        message: `Too many fields: ${query.select.length} (max: ${this.guardrails.maxSelectFields})`,
        path: "select",
      });
    }

    // Validate each selected field
    for (let i = 0; i < query.select.length; i++) {
      const field = query.select[i];
      const parsed = parseQualifiedField(field);

      if (!parsed) {
        errors.push({
          code: "SYNTAX_ERROR",
          message: `Invalid field format: ${field}. Use alias.field format.`,
          path: `select[${i}]`,
        });
        continue;
      }

      if (!aliasToEntity.has(parsed.alias)) {
        errors.push({
          code: "INVALID_ALIAS",
          message: `Unknown alias: ${parsed.alias}`,
          path: `select[${i}]`,
        });
        continue;
      }

      // Validate field exists on entity
      const entityName = aliasToEntity.get(parsed.alias)!;
      const entity = await this.registry.getEntity(entityName);
      if (entity && !entity.fields.includes(parsed.field)) {
        errors.push({
          code: "UNKNOWN_FIELD",
          message: `Unknown field: ${parsed.field} on entity ${entityName}`,
          path: `select[${i}]`,
        });
      }
    }

    // Validate LIMIT
    if (query.limit > this.guardrails.maxLimit) {
      errors.push({
        code: "MAX_LIMIT_EXCEEDED",
        message: `Limit too high: ${query.limit} (max: ${this.guardrails.maxLimit})`,
        path: "limit",
      });
    }

    // Build result
    if (errors.length > 0) {
      return { validation: { valid: false, errors, warnings } };
    }

    // Build join graph
    const joinGraph = this.buildJoinGraph(query, baseEntity, plannedJoins, aliasToEntity);

    const plan: JoinPlan = {
      baseEntity: query.from,
      baseTable: baseEntity.tableName,
      baseAlias,
      joins: plannedJoins,
      joinGraph,
      maxDepth: Math.max(0, ...plannedJoins.map((j) => j.depth)),
      warnings,
    };

    return {
      plan,
      validation: {
        valid: true,
        errors: [],
        warnings,
        normalizedQuery: query,
      },
    };
  }

  /**
   * Extract source alias from join condition
   * e.g., "a.orderId = b.id" => "a"
   */
  private extractSourceAliasFromCondition(condition: string): string | null {
    // Simple parser: expects "alias1.field1 = alias2.field2"
    const match = condition.match(/^(\w+)\.\w+\s*=\s*\w+\.\w+$/);
    if (match) {
      return match[1];
    }
    return null;
  }

  /**
   * Calculate join depth
   */
  private calculateJoinDepth(
    sourceAlias: string,
    plannedJoins: PlannedJoin[],
    baseAlias: string
  ): number {
    if (sourceAlias === baseAlias) {
      return 1;
    }

    const sourceJoin = plannedJoins.find((j) => j.definition.as === sourceAlias);
    if (sourceJoin) {
      return sourceJoin.depth + 1;
    }

    return 1;
  }

  /**
   * Build join graph for visualization
   */
  private buildJoinGraph(
    query: QueryRequest,
    baseEntity: EntityMetadata,
    plannedJoins: PlannedJoin[],
    _aliasToEntity: Map<string, string>
  ): JoinGraphNode[] {
    const nodes: JoinGraphNode[] = [];
    const baseAlias = query.as ?? query.from.charAt(0).toLowerCase();

    // Base node
    const baseFields = query.select
      .filter((s) => s.startsWith(`${baseAlias}.`))
      .map((s) => s.split(".")[1]);

    nodes.push({
      entity: query.from,
      alias: baseAlias,
      selectedFields: baseFields,
    });

    // Join nodes
    for (const planned of plannedJoins) {
      const joinedFields = query.select
        .filter((s) => s.startsWith(`${planned.definition.as}.`))
        .map((s) => s.split(".")[1]);

      nodes.push({
        entity: planned.targetEntity,
        alias: planned.definition.as,
        joinType: planned.definition.type,
        parentAlias: planned.sourceAlias,
        joinCondition: planned.definition.on,
        selectedFields: joinedFields,
      });
    }

    return nodes;
  }
}
