/**
 * Query API Routes
 *
 * REST endpoints for executing cross-entity queries.
 */

import { z } from "zod";

import type { GenericQueryService } from "./query.service.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { SubjectSnapshot } from "../../security/field-security/types.js";
import type { Router, Request, Response, NextFunction } from "express";

// ============================================================================
// Request Validation Schemas
// ============================================================================

const WhereConditionSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string(),
      operator: z.enum([
        "eq", "neq", "gt", "gte", "lt", "lte",
        "in", "nin", "like", "ilike", "is_null", "is_not_null", "between"
      ]),
      value: z.unknown(),
    }),
    z.object({
      logic: z.enum(["and", "or"]),
      conditions: z.array(WhereConditionSchema),
    }),
  ])
);

const JoinDefinitionSchema = z.object({
  type: z.enum(["inner", "left"]),
  entity: z.string(),
  as: z.string().regex(/^[a-z][a-z0-9_]*$/i, "Alias must be alphanumeric"),
  on: z.string(),
});

const OrderBySchema = z.object({
  field: z.string(),
  direction: z.enum(["asc", "desc"]),
  nulls: z.enum(["first", "last"]).optional(),
});

const QueryOptionsSchema = z.object({
  timeout: z.number().min(1000).max(60000).optional(),
  useReplica: z.boolean().optional(),
  explain: z.boolean().optional(),
  distinct: z.boolean().optional(),
});

const QueryRequestSchema = z.object({
  from: z.string(),
  as: z.string().regex(/^[a-z][a-z0-9_]*$/i).optional(),
  select: z.array(z.string()).min(1).max(50),
  joins: z.array(JoinDefinitionSchema).max(5).optional(),
  where: WhereConditionSchema.optional(),
  orderBy: z.array(OrderBySchema).max(5).optional(),
  limit: z.number().min(1).max(1000),
  offset: z.number().min(0).optional(),
  includeCount: z.boolean().optional(),
  options: QueryOptionsSchema.optional(),
});

const ValidateRequestSchema = z.object({
  query: QueryRequestSchema,
});

const ExplainRequestSchema = z.object({
  query: QueryRequestSchema,
});

// ============================================================================
// Route Handler Factory
// ============================================================================

export interface QueryRoutesDependencies {
  queryService: GenericQueryService;
  logger: Logger;
  getSubject: (req: Request) => SubjectSnapshot;
  getTenantId: (req: Request) => string;
}

/**
 * Create query API routes
 */
export function createQueryRoutes(
  router: Router,
  deps: QueryRoutesDependencies
): Router {
  const { queryService, logger, getSubject, getTenantId } = deps;

  /**
   * POST /query/run
   * Execute a query
   */
  router.post("/query/run", async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = req.headers["x-request-id"] as string | undefined;
    const traceId = req.headers["x-trace-id"] as string | undefined;

    try {
      // Validate request body
      const parseResult = QueryRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "INVALID_REQUEST",
          message: "Invalid query format",
          details: parseResult.error.errors,
        });
      }

      const query = parseResult.data;
      const subject = getSubject(req);
      const tenantId = getTenantId(req);

      // Execute query
      const result = await queryService.executeQuery(query, {
        tenantId,
        subject,
        options: {
          timeout: query.options?.timeout,
          useReplica: query.options?.useReplica,
          explain: query.options?.explain,
          requestId,
          traceId,
        },
      });

      // Add timing header
      res.setHeader("X-Query-Time-Ms", String(result.meta.executionTimeMs));

      return res.json(result);
    } catch (error: any) {
      logger.error("Query execution failed", {
        error,
        requestId,
        duration: Date.now() - startTime,
      });

      if (error.name === "QueryValidationError") {
        return res.status(400).json({
          error: "QUERY_VALIDATION_ERROR",
          message: error.message,
          details: error.errors,
        });
      }

      if (error.name === "QueryTimeoutError") {
        return res.status(504).json({
          error: "QUERY_TIMEOUT",
          message: error.message,
        });
      }

      return next(error);
    }
  });

  /**
   * POST /query/validate
   * Validate a query without executing
   */
  router.post("/query/validate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = ValidateRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "INVALID_REQUEST",
          message: "Invalid request format",
          details: parseResult.error.errors,
        });
      }

      const { query } = parseResult.data;
      const tenantId = getTenantId(req);

      const validation = await queryService.validateQuery(query, tenantId);

      return res.json({
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    } catch (error) {
      logger.error("Query validation failed", { error });
      return next(error);
    }
  });

  /**
   * POST /query/explain
   * Explain query execution plan
   */
  router.post("/query/explain", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = ExplainRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "INVALID_REQUEST",
          message: "Invalid request format",
          details: parseResult.error.errors,
        });
      }

      const { query } = parseResult.data;
      const subject = getSubject(req);
      const tenantId = getTenantId(req);

      const explanation = await queryService.explainQuery(query, {
        tenantId,
        subject,
      });

      return res.json({
        valid: explanation.validation.valid,
        errors: explanation.validation.errors,
        warnings: explanation.validation.warnings,
        plan: explanation.plan
          ? {
              baseEntity: explanation.plan.baseEntity,
              baseTable: explanation.plan.baseTable,
              joins: explanation.plan.joins.map((j) => ({
                entity: j.targetEntity,
                table: j.targetTable,
                type: j.definition.type,
                alias: j.definition.as,
                depth: j.depth,
              })),
              joinGraph: explanation.plan.joinGraph,
              maxDepth: explanation.plan.maxDepth,
            }
          : undefined,
        projectedSql: explanation.projectedSql,
      });
    } catch (error) {
      logger.error("Query explain failed", { error });
      return next(error);
    }
  });

  /**
   * GET /query/entities
   * List available entities for querying
   */
  router.get("/query/entities", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would need access to the relationship registry
      // For now, return a placeholder
      return res.json({
        message: "Entity listing requires relationship registry integration",
      });
    } catch (error) {
      logger.error("Entity listing failed", { error });
      return next(error);
    }
  });

  /**
   * GET /query/entities/:entity/relationships
   * List joinable entities from a given entity
   */
  router.get(
    "/query/entities/:entity/relationships",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // This would need access to the relationship registry
        // For now, return a placeholder
        return res.json({
          entity: req.params.entity,
          message: "Relationship listing requires relationship registry integration",
        });
      } catch (error) {
        logger.error("Relationship listing failed", { error });
        return next(error);
      }
    }
  );

  return router;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Query rate limiting middleware
 */
export function queryRateLimitMiddleware(
  maxRequestsPerMinute: number = 60
): (req: Request, res: Response, next: NextFunction) => void {
  const requests = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    // Get existing timestamps for this IP
    let timestamps = requests.get(key) ?? [];

    // Filter to only recent timestamps
    timestamps = timestamps.filter((ts) => ts > windowStart);

    if (timestamps.length >= maxRequestsPerMinute) {
      return res.status(429).json({
        error: "RATE_LIMIT_EXCEEDED",
        message: `Maximum ${maxRequestsPerMinute} queries per minute exceeded`,
        retryAfter: Math.ceil((timestamps[0] + 60000 - now) / 1000),
      });
    }

    // Add current timestamp
    timestamps.push(now);
    requests.set(key, timestamps);

    next();
  };
}

/**
 * Query complexity analysis middleware
 * Rejects overly complex queries early
 */
export function queryComplexityMiddleware(
  maxComplexity: number = 100
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST" || !req.body) {
      return next();
    }

    const query = req.body.query ?? req.body;

    // Calculate complexity score
    let complexity = 0;

    // Base complexity
    complexity += 10;

    // Fields complexity
    const selectCount = query.select?.length ?? 0;
    complexity += selectCount * 2;

    // Joins complexity (exponential)
    const joinCount = query.joins?.length ?? 0;
    complexity += joinCount * 15;

    // Where complexity
    complexity += countWhereConditions(query.where) * 3;

    // Order by complexity
    complexity += (query.orderBy?.length ?? 0) * 2;

    if (complexity > maxComplexity) {
      return res.status(400).json({
        error: "QUERY_TOO_COMPLEX",
        message: `Query complexity (${complexity}) exceeds maximum (${maxComplexity})`,
        complexity,
        maxComplexity,
      });
    }

    // Add complexity to request for logging
    (req as any).queryComplexity = complexity;

    next();
  };
}

/**
 * Count conditions in a WHERE clause
 */
function countWhereConditions(where: any): number {
  if (!where) return 0;

  if (where.logic && where.conditions) {
    return where.conditions.reduce(
      (sum: number, c: any) => sum + countWhereConditions(c),
      1
    );
  }

  return 1;
}
