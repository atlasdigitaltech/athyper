/**
 * Generic Query Service
 *
 * Executes cross-entity queries using Kysely with security enforcement,
 * tenant isolation, and field-level access control.
 */

import { sql } from "kysely";

import {
  DEFAULT_GUARDRAILS,
  isWhereGroup,
  parseQualifiedField,
} from "./query-dsl.js";

import type { JoinPlanner, JoinPlan, IRelationshipRegistry } from "./join-planner.js";
import type {
  QueryRequest,
  QueryResponse,
  QueryMetadata,
  QueryGuardrails,
  QueryValidationResult,
  WhereCondition,
  WhereGroup,
  OrderByClause,
} from "./query-dsl.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { FieldProjectionBuilder } from "../../security/field-security/field-projection.js";
import type { SubjectSnapshot } from "../../security/field-security/types.js";
import type { Kysely, SelectQueryBuilder } from "kysely";

// ============================================================================
// Types
// ============================================================================

/**
 * Query execution options
 */
export interface QueryExecutionOptions {
  /** Statement timeout in milliseconds */
  timeout?: number;

  /** Use read replica if available */
  useReplica?: boolean;

  /** Include explain plan */
  explain?: boolean;

  /** Request ID for tracing */
  requestId?: string;

  /** Trace ID for distributed tracing */
  traceId?: string;
}

/**
 * Query execution context
 */
export interface QueryContext {
  /** Tenant ID (required) */
  tenantId: string;

  /** Subject making the request */
  subject: SubjectSnapshot;

  /** Execution options */
  options?: QueryExecutionOptions;
}

/**
 * Internal query build result
 */
interface BuiltQuery {
  /** SQL query string (for logging/explain) */
  sql: string;

  /** Parameters */
  parameters: unknown[];

  /** Kysely query builder (for execution) */
  queryBuilder: SelectQueryBuilder<any, any, any>;

  /** Count query builder (if includeCount) */
  countQueryBuilder?: SelectQueryBuilder<any, any, any>;
}

// ============================================================================
// Generic Query Service
// ============================================================================

/**
 * Service for executing cross-entity queries with security enforcement.
 */
export class GenericQueryService {
  private guardrails: QueryGuardrails;

  constructor(
    private db: Kysely<any>,
    private replicaDb: Kysely<any> | null,
    private joinPlanner: JoinPlanner,
    private fieldProjection: FieldProjectionBuilder,
    private registry: IRelationshipRegistry,
    private logger: Logger,
    guardrails?: Partial<QueryGuardrails>
  ) {
    this.guardrails = { ...DEFAULT_GUARDRAILS, ...guardrails };
  }

  /**
   * Execute a query with full validation and security enforcement
   */
  async executeQuery<T = Record<string, unknown>>(
    query: QueryRequest,
    context: QueryContext
  ): Promise<QueryResponse<T>> {
    const startTime = Date.now();
    const { tenantId, subject, options = {} } = context;

    // Validate query
    const validation = await this.validateQuery(query, tenantId);
    if (!validation.valid) {
      throw new QueryValidationError(validation.errors);
    }

    // Plan joins
    const { plan, validation: planValidation } = await this.joinPlanner.planJoins(
      query,
      tenantId
    );

    if (!plan || !planValidation.valid) {
      throw new QueryValidationError(planValidation.errors);
    }

    // Build query with security
    const builtQuery = await this.buildQuery(query, plan, subject, context);

    // Select database (main or replica)
    const _targetDb =
      options.useReplica && this.replicaDb ? this.replicaDb : this.db;

    // Execute with timeout
    const timeout = Math.min(
      options.timeout ?? this.guardrails.defaultTimeout,
      this.guardrails.maxTimeout
    );

    try {
      const [rows, totalCount] = await Promise.all([
        this.executeWithTimeout(builtQuery.queryBuilder, timeout),
        query.includeCount && builtQuery.countQueryBuilder
          ? this.executeCountWithTimeout(builtQuery.countQueryBuilder, timeout)
          : Promise.resolve(undefined),
      ]);

      const executionTimeMs = Date.now() - startTime;

      // Build metadata
      const meta: QueryMetadata = {
        executionTimeMs,
        rowCount: rows.length,
        entitiesAccessed: [plan.baseEntity, ...plan.joins.map((j) => j.targetEntity)],
        fieldsReturned: query.select,
      };

      // Add explain plan if requested
      if (options.explain) {
        meta.explainPlan = {
          joinGraph: plan.joinGraph,
          projectedSql: builtQuery.sql,
        };
      }

      return {
        data: rows as T[],
        totalCount,
        pagination: {
          offset: query.offset ?? 0,
          limit: query.limit,
          hasMore: totalCount !== undefined ? (query.offset ?? 0) + rows.length < totalCount : rows.length === query.limit,
        },
        meta,
      };
    } catch (error) {
      this.logger.error("Query execution failed", {
        error,
        query,
        requestId: options.requestId,
      });
      throw error;
    }
  }

  /**
   * Validate a query without executing
   */
  async validateQuery(
    query: QueryRequest,
    tenantId: string
  ): Promise<QueryValidationResult> {
    const { plan: _plan, validation } = await this.joinPlanner.planJoins(query, tenantId);
    return validation;
  }

  /**
   * Explain a query (return plan without executing)
   */
  async explainQuery(
    query: QueryRequest,
    context: QueryContext
  ): Promise<{
    validation: QueryValidationResult;
    plan?: JoinPlan;
    projectedSql?: string;
  }> {
    const { tenantId, subject } = context;

    const { plan, validation } = await this.joinPlanner.planJoins(query, tenantId);

    if (!plan || !validation.valid) {
      return { validation };
    }

    // Build query to get SQL
    const builtQuery = await this.buildQuery(query, plan, subject, context);

    return {
      validation,
      plan,
      projectedSql: builtQuery.sql,
    };
  }

  /**
   * Build the Kysely query from request and plan
   */
  private async buildQuery(
    query: QueryRequest,
    plan: JoinPlan,
    subject: SubjectSnapshot,
    context: QueryContext
  ): Promise<BuiltQuery> {
    const { tenantId } = context;

    // Start with base table
    let qb = this.db
      .selectFrom(`${plan.baseTable} as ${plan.baseAlias}`)
      .where(`${plan.baseAlias}.tenant_id`, "=", tenantId);

    // Apply joins
    for (const plannedJoin of plan.joins) {
      const joinCondition = this.parseJoinCondition(plannedJoin.definition.on);

      if (plannedJoin.definition.type === "inner") {
        qb = qb.innerJoin(
          `${plannedJoin.targetTable} as ${plannedJoin.definition.as}`,
          (join) =>
            join
              .onRef(joinCondition.leftColumn as any, "=", joinCondition.rightColumn as any)
              .on(`${plannedJoin.definition.as}.tenant_id`, "=", tenantId)
        );
      } else {
        qb = qb.leftJoin(
          `${plannedJoin.targetTable} as ${plannedJoin.definition.as}`,
          (join) =>
            join
              .onRef(joinCondition.leftColumn as any, "=", joinCondition.rightColumn as any)
              .on(`${plannedJoin.definition.as}.tenant_id`, "=", tenantId)
        );
      }
    }

    // Build field projection with security
    const projection = await this.buildSecureProjection(query, plan, subject, tenantId);

    // Apply SELECT with security-filtered fields
    qb = qb.select(projection.columns.map((col) => sql.raw(col) as any));

    // Apply WHERE conditions
    if (query.where) {
      qb = this.applyWhereConditions(qb, query.where);
    }

    // Apply ORDER BY
    if (query.orderBy && query.orderBy.length > 0) {
      qb = this.applyOrderBy(qb, query.orderBy);
    }

    // Apply LIMIT and OFFSET
    qb = qb.limit(Math.min(query.limit, this.guardrails.maxLimit));
    if (query.offset) {
      qb = qb.offset(query.offset);
    }

    // Build count query if needed
    let countQb: SelectQueryBuilder<any, any, any> | undefined;
    if (query.includeCount) {
      countQb = this.db
        .selectFrom(`${plan.baseTable} as ${plan.baseAlias}`)
        .select(sql`count(*)`.as("count"))
        .where(`${plan.baseAlias}.tenant_id`, "=", tenantId);

      // Apply same joins
      for (const plannedJoin of plan.joins) {
        const joinCondition = this.parseJoinCondition(plannedJoin.definition.on);

        if (plannedJoin.definition.type === "inner") {
          countQb = countQb.innerJoin(
            `${plannedJoin.targetTable} as ${plannedJoin.definition.as}`,
            (join) =>
              join
                .onRef(joinCondition.leftColumn as any, "=", joinCondition.rightColumn as any)
                .on(`${plannedJoin.definition.as}.tenant_id`, "=", tenantId)
          );
        } else {
          countQb = countQb.leftJoin(
            `${plannedJoin.targetTable} as ${plannedJoin.definition.as}`,
            (join) =>
              join
                .onRef(joinCondition.leftColumn as any, "=", joinCondition.rightColumn as any)
                .on(`${plannedJoin.definition.as}.tenant_id`, "=", tenantId)
          );
        }
      }

      // Apply same WHERE
      if (query.where) {
        countQb = this.applyWhereConditions(countQb, query.where);
      }
    }

    // Compile to get SQL for logging
    const compiled = qb.compile();

    return {
      sql: compiled.sql,
      parameters: compiled.parameters as unknown[],
      queryBuilder: qb,
      countQueryBuilder: countQb,
    };
  }

  /**
   * Build secure field projection
   */
  private async buildSecureProjection(
    query: QueryRequest,
    plan: JoinPlan,
    subject: SubjectSnapshot,
    tenantId: string
  ): Promise<{ columns: string[]; deniedFields: string[] }> {
    const columns: string[] = [];
    const deniedFields: string[] = [];

    // Group selected fields by alias
    const fieldsByAlias = new Map<string, string[]>();
    for (const field of query.select) {
      const parsed = parseQualifiedField(field);
      if (!parsed) continue;

      if (!fieldsByAlias.has(parsed.alias)) {
        fieldsByAlias.set(parsed.alias, []);
      }
      fieldsByAlias.get(parsed.alias)!.push(parsed.field);
    }

    // Process base entity fields
    const baseFields = fieldsByAlias.get(plan.baseAlias) ?? [];
    const baseEntity = await this.registry.getEntity(plan.baseEntity);

    if (baseEntity && baseFields.length > 0) {
      const projection = await this.fieldProjection.buildEntityProjection(
        plan.baseEntity,
        baseFields,
        subject,
        { tenantId },
        plan.baseAlias,
        { applyMaskingInSql: true }
      );

      columns.push(...projection.selectColumns);
      deniedFields.push(...projection.deniedFields.map((f) => `${plan.baseAlias}.${f}`));
    }

    // Process joined entity fields
    for (const join of plan.joins) {
      const joinFields = fieldsByAlias.get(join.definition.as) ?? [];
      const joinEntity = await this.registry.getEntity(join.targetEntity);

      if (joinEntity && joinFields.length > 0) {
        const projection = await this.fieldProjection.buildEntityProjection(
          join.targetEntity,
          joinFields,
          subject,
          { tenantId },
          join.definition.as,
          { applyMaskingInSql: true }
        );

        columns.push(...projection.selectColumns);
        deniedFields.push(...projection.deniedFields.map((f) => `${join.definition.as}.${f}`));
      }
    }

    return { columns, deniedFields };
  }

  /**
   * Parse join condition string to column references
   */
  private parseJoinCondition(condition: string): {
    leftColumn: string;
    rightColumn: string;
  } {
    // Expected format: "alias1.field1 = alias2.field2"
    const match = condition.match(/^(\w+\.\w+)\s*=\s*(\w+\.\w+)$/);
    if (!match) {
      throw new Error(`Invalid join condition format: ${condition}`);
    }
    return {
      leftColumn: match[1],
      rightColumn: match[2],
    };
  }

  /**
   * Apply WHERE conditions to query
   */
  private applyWhereConditions(
    qb: SelectQueryBuilder<any, any, any>,
    where: WhereCondition | WhereGroup
  ): SelectQueryBuilder<any, any, any> {
    if (isWhereGroup(where)) {
      return this.applyWhereGroup(qb, where);
    } else {
      return this.applyWhereCondition(qb, where);
    }
  }

  /**
   * Apply a WHERE group (AND/OR)
   */
  private applyWhereGroup(
    qb: SelectQueryBuilder<any, any, any>,
    group: WhereGroup
  ): SelectQueryBuilder<any, any, any> {
    if (group.conditions.length === 0) {
      return qb;
    }

    if (group.logic === "and") {
      return qb.where((eb) => {
        let combined = eb.and([]);
        for (const condition of group.conditions) {
          if (isWhereGroup(condition)) {
            combined = eb.and([combined, this.buildWhereGroup(eb, condition)]);
          } else {
            combined = eb.and([combined, this.buildWhereCondition(eb, condition)]);
          }
        }
        return combined;
      });
    } else {
      return qb.where((eb) => {
        let combined = eb.or([]);
        for (const condition of group.conditions) {
          if (isWhereGroup(condition)) {
            combined = eb.or([combined, this.buildWhereGroup(eb, condition)]);
          } else {
            combined = eb.or([combined, this.buildWhereCondition(eb, condition)]);
          }
        }
        return combined;
      });
    }
  }

  /**
   * Build WHERE group expression
   */
  private buildWhereGroup(eb: any, group: WhereGroup): any {
    if (group.conditions.length === 0) {
      return eb.lit(true);
    }

    const expressions = group.conditions.map((condition) => {
      if (isWhereGroup(condition)) {
        return this.buildWhereGroup(eb, condition);
      } else {
        return this.buildWhereCondition(eb, condition);
      }
    });

    if (group.logic === "and") {
      return eb.and(expressions);
    } else {
      return eb.or(expressions);
    }
  }

  /**
   * Build WHERE condition expression
   */
  private buildWhereCondition(eb: any, condition: WhereCondition): any {
    const column = condition.field;
    const value = condition.value;

    switch (condition.operator) {
      case "eq":
        return eb(column, "=", value);
      case "neq":
        return eb(column, "!=", value);
      case "gt":
        return eb(column, ">", value);
      case "gte":
        return eb(column, ">=", value);
      case "lt":
        return eb(column, "<", value);
      case "lte":
        return eb(column, "<=", value);
      case "in":
        return eb(column, "in", value as unknown[]);
      case "nin":
        return eb(column, "not in", value as unknown[]);
      case "like":
        return eb(column, "like", value);
      case "ilike":
        return eb(column, "ilike", value);
      case "is_null":
        return eb(column, "is", null);
      case "is_not_null":
        return eb(column, "is not", null);
      case "between": {
        const [min, max] = value as [unknown, unknown];
        return eb.and([eb(column, ">=", min), eb(column, "<=", max)]);
      }
      default:
        throw new Error(`Unsupported operator: ${condition.operator}`);
    }
  }

  /**
   * Apply single WHERE condition
   */
  private applyWhereCondition(
    qb: SelectQueryBuilder<any, any, any>,
    condition: WhereCondition
  ): SelectQueryBuilder<any, any, any> {
    return qb.where((eb) => this.buildWhereCondition(eb, condition));
  }

  /**
   * Apply ORDER BY clauses
   */
  private applyOrderBy(
    qb: SelectQueryBuilder<any, any, any>,
    orderBy: OrderByClause[]
  ): SelectQueryBuilder<any, any, any> {
    for (const clause of orderBy) {
      const direction = clause.direction === "desc" ? "desc" : "asc";

      if (clause.nulls) {
        const nullsDirection = clause.nulls === "first" ? "nulls first" : "nulls last";
        qb = qb.orderBy(sql.raw(`${clause.field} ${direction} ${nullsDirection}`) as any);
      } else {
        qb = qb.orderBy(clause.field as any, direction);
      }
    }
    return qb;
  }

  /**
   * Execute query with timeout
   */
  private async executeWithTimeout(
    qb: SelectQueryBuilder<any, any, any>,
    timeoutMs: number
  ): Promise<unknown[]> {
    // Set statement timeout
    const _timeoutSeconds = Math.ceil(timeoutMs / 1000);

    return this.db.transaction().execute(async (trx) => {
      // Set timeout for this transaction
      await sql`SET LOCAL statement_timeout = ${sql.raw(String(timeoutMs))}`.execute(trx);

      // Execute query
      const result = await qb.execute();
      return result;
    });
  }

  /**
   * Execute count query with timeout
   */
  private async executeCountWithTimeout(
    qb: SelectQueryBuilder<any, any, any>,
    timeoutMs: number
  ): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      await sql`SET LOCAL statement_timeout = ${sql.raw(String(timeoutMs))}`.execute(trx);

      const result = await qb.executeTakeFirst();
      return Number((result as any)?.count ?? 0);
    });
  }
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Query validation error
 */
export class QueryValidationError extends Error {
  constructor(public errors: Array<{ code: string; message: string; path?: string }>) {
    super(`Query validation failed: ${errors.map((e) => e.message).join(", ")}`);
    this.name = "QueryValidationError";
  }
}

/**
 * Query timeout error
 */
export class QueryTimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`Query exceeded timeout of ${timeoutMs}ms`);
    this.name = "QueryTimeoutError";
  }
}
