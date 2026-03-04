/**
 * Query Observability
 *
 * Metrics and tracing for cross-entity queries.
 * Provides insights into query performance, usage patterns, and errors.
 */

import type { JoinPlan } from "./join-planner.js";
import type { QueryRequest, QueryResponse, QueryValidationResult } from "./query-dsl.js";
import type { Logger } from "../../../../../kernel/logger.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Query metrics collector interface
 */
export interface IQueryMetricsCollector {
  /** Record query execution */
  recordQueryExecution(params: QueryExecutionMetric): void;

  /** Record query validation */
  recordQueryValidation(params: QueryValidationMetric): void;

  /** Record query error */
  recordQueryError(params: QueryErrorMetric): void;

  /** Get current metrics snapshot */
  getMetrics(): QueryMetricsSnapshot;

  /** Reset metrics */
  reset(): void;
}

/**
 * Query execution metric
 */
export interface QueryExecutionMetric {
  /** Entity being queried */
  entity: string;

  /** Number of joins */
  joinCount: number;

  /** Join depth */
  joinDepth: number;

  /** Number of fields selected */
  fieldCount: number;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Row count returned */
  rowCount: number;

  /** Whether query used replica */
  usedReplica: boolean;

  /** Whether query included count */
  includedCount: boolean;

  /** Tenant ID */
  tenantId: string;

  /** Subject type */
  subjectType?: string;
}

/**
 * Query validation metric
 */
export interface QueryValidationMetric {
  /** Entity being queried */
  entity: string;

  /** Whether validation passed */
  valid: boolean;

  /** Error codes if failed */
  errorCodes: string[];

  /** Validation time in milliseconds */
  validationTimeMs: number;
}

/**
 * Query error metric
 */
export interface QueryErrorMetric {
  /** Entity being queried */
  entity: string;

  /** Error type */
  errorType: string;

  /** Error message */
  errorMessage: string;

  /** Execution time before error */
  executionTimeMs: number;
}

/**
 * Metrics snapshot
 */
export interface QueryMetricsSnapshot {
  /** Total queries executed */
  totalQueries: number;

  /** Total failed queries */
  totalErrors: number;

  /** Total validation failures */
  totalValidationFailures: number;

  /** Average execution time (ms) */
  avgExecutionTimeMs: number;

  /** P95 execution time (ms) */
  p95ExecutionTimeMs: number;

  /** P99 execution time (ms) */
  p99ExecutionTimeMs: number;

  /** Queries by entity */
  queriesByEntity: Record<string, number>;

  /** Errors by type */
  errorsByType: Record<string, number>;

  /** Average join count */
  avgJoinCount: number;

  /** Average field count */
  avgFieldCount: number;

  /** Total rows returned */
  totalRowsReturned: number;

  /** Collection period start */
  periodStart: Date;

  /** Collection period end */
  periodEnd: Date;
}

// ============================================================================
// In-Memory Metrics Collector
// ============================================================================

/**
 * In-memory implementation of metrics collector.
 * Suitable for development and testing.
 * For production, use a proper metrics backend (Prometheus, StatsD, etc.)
 */
export class InMemoryMetricsCollector implements IQueryMetricsCollector {
  private executions: QueryExecutionMetric[] = [];
  private validations: QueryValidationMetric[] = [];
  private errors: QueryErrorMetric[] = [];
  private periodStart = new Date();

  recordQueryExecution(params: QueryExecutionMetric): void {
    this.executions.push(params);

    // Keep last 10000 records
    if (this.executions.length > 10000) {
      this.executions = this.executions.slice(-5000);
    }
  }

  recordQueryValidation(params: QueryValidationMetric): void {
    this.validations.push(params);

    if (this.validations.length > 10000) {
      this.validations = this.validations.slice(-5000);
    }
  }

  recordQueryError(params: QueryErrorMetric): void {
    this.errors.push(params);

    if (this.errors.length > 10000) {
      this.errors = this.errors.slice(-5000);
    }
  }

  getMetrics(): QueryMetricsSnapshot {
    const executionTimes = this.executions.map((e) => e.executionTimeMs).sort((a, b) => a - b);

    const p95Index = Math.floor(executionTimes.length * 0.95);
    const p99Index = Math.floor(executionTimes.length * 0.99);

    const queriesByEntity: Record<string, number> = {};
    for (const exec of this.executions) {
      queriesByEntity[exec.entity] = (queriesByEntity[exec.entity] ?? 0) + 1;
    }

    const errorsByType: Record<string, number> = {};
    for (const error of this.errors) {
      errorsByType[error.errorType] = (errorsByType[error.errorType] ?? 0) + 1;
    }

    return {
      totalQueries: this.executions.length,
      totalErrors: this.errors.length,
      totalValidationFailures: this.validations.filter((v) => !v.valid).length,
      avgExecutionTimeMs:
        executionTimes.length > 0
          ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
          : 0,
      p95ExecutionTimeMs: executionTimes[p95Index] ?? 0,
      p99ExecutionTimeMs: executionTimes[p99Index] ?? 0,
      queriesByEntity,
      errorsByType,
      avgJoinCount:
        this.executions.length > 0
          ? this.executions.reduce((sum, e) => sum + e.joinCount, 0) / this.executions.length
          : 0,
      avgFieldCount:
        this.executions.length > 0
          ? this.executions.reduce((sum, e) => sum + e.fieldCount, 0) / this.executions.length
          : 0,
      totalRowsReturned: this.executions.reduce((sum, e) => sum + e.rowCount, 0),
      periodStart: this.periodStart,
      periodEnd: new Date(),
    };
  }

  reset(): void {
    this.executions = [];
    this.validations = [];
    this.errors = [];
    this.periodStart = new Date();
  }
}

// ============================================================================
// Tracing
// ============================================================================

/**
 * Span context for distributed tracing
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

/**
 * Query span attributes
 */
export interface QuerySpanAttributes {
  "query.entity": string;
  "query.join_count": number;
  "query.join_depth": number;
  "query.field_count": number;
  "query.limit": number;
  "query.offset"?: number;
  "query.include_count": boolean;
  "query.use_replica": boolean;
  "query.complexity"?: number;
  "db.system": string;
  "db.operation": string;
}

/**
 * Query tracer interface
 */
export interface IQueryTracer {
  /** Start a query span */
  startSpan(
    name: string,
    attributes: Partial<QuerySpanAttributes>,
    parentContext?: SpanContext
  ): QuerySpan;
}

/**
 * Query span interface
 */
export interface QuerySpan {
  /** Span context */
  context: SpanContext;

  /** Set attribute */
  setAttribute(key: string, value: string | number | boolean): void;

  /** Add event */
  addEvent(name: string, attributes?: Record<string, unknown>): void;

  /** Set status */
  setStatus(status: "ok" | "error", message?: string): void;

  /** End span */
  end(): void;
}

/**
 * No-op tracer for when tracing is disabled
 */
export class NoOpTracer implements IQueryTracer {
  startSpan(
    _name: string,
    _attributes: Partial<QuerySpanAttributes>,
    _parentContext?: SpanContext
  ): QuerySpan {
    return new NoOpSpan();
  }
}

/**
 * No-op span
 */
class NoOpSpan implements QuerySpan {
  context: SpanContext = {
    traceId: "00000000000000000000000000000000",
    spanId: "0000000000000000",
  };

  setAttribute(_key: string, _value: string | number | boolean): void {}
  addEvent(_name: string, _attributes?: Record<string, unknown>): void {}
  setStatus(_status: "ok" | "error", _message?: string): void {}
  end(): void {}
}

/**
 * Simple console tracer for development
 */
export class ConsoleTracer implements IQueryTracer {
  constructor(private logger: Logger) {}

  startSpan(
    name: string,
    attributes: Partial<QuerySpanAttributes>,
    parentContext?: SpanContext
  ): QuerySpan {
    const context: SpanContext = {
      traceId: parentContext?.traceId ?? this.generateId(32),
      spanId: this.generateId(16),
      parentSpanId: parentContext?.spanId,
    };

    const startTime = Date.now();
    const span = new ConsoleSpan(context, name, attributes, startTime, this.logger);

    this.logger.debug(`[TRACE] Span started: ${name}`, {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      attributes,
    });

    return span;
  }

  private generateId(length: number): string {
    const chars = "0123456789abcdef";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

/**
 * Console span implementation
 */
class ConsoleSpan implements QuerySpan {
  private attributes: Record<string, unknown>;
  private events: Array<{ name: string; attributes?: Record<string, unknown>; timestamp: number }> = [];
  private status: { status: "ok" | "error"; message?: string } = { status: "ok" };

  constructor(
    public context: SpanContext,
    private name: string,
    initialAttributes: Partial<QuerySpanAttributes>,
    private startTime: number,
    private logger: Logger
  ) {
    this.attributes = { ...initialAttributes };
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    this.events.push({ name, attributes, timestamp: Date.now() });
  }

  setStatus(status: "ok" | "error", message?: string): void {
    this.status = { status, message };
  }

  end(): void {
    const duration = Date.now() - this.startTime;

    this.logger.debug(`[TRACE] Span ended: ${this.name}`, {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      duration,
      status: this.status,
      attributes: this.attributes,
      events: this.events,
    });
  }
}

// ============================================================================
// Observable Query Service Wrapper
// ============================================================================

/**
 * Options for observable query service
 */
export interface ObservableQueryServiceOptions {
  /** Metrics collector */
  metrics?: IQueryMetricsCollector;

  /** Tracer */
  tracer?: IQueryTracer;

  /** Logger */
  logger: Logger;

  /** Whether to log slow queries */
  logSlowQueries?: boolean;

  /** Slow query threshold in ms */
  slowQueryThresholdMs?: number;
}

/**
 * Create observability hooks for query service
 */
export function createQueryObservabilityHooks(options: ObservableQueryServiceOptions) {
  const {
    metrics = new InMemoryMetricsCollector(),
    tracer = new NoOpTracer(),
    logger,
    logSlowQueries = true,
    slowQueryThresholdMs = 1000,
  } = options;

  return {
    /**
     * Called before query execution
     */
    onQueryStart(
      query: QueryRequest,
      _tenantId: string,
      requestId?: string,
      traceId?: string
    ): { span: QuerySpan; startTime: number } {
      const span = tracer.startSpan(
        "query.execute",
        {
          "query.entity": query.from,
          "query.join_count": query.joins?.length ?? 0,
          "query.field_count": query.select.length,
          "query.limit": query.limit,
          "query.offset": query.offset,
          "query.include_count": query.includeCount ?? false,
          "query.use_replica": query.options?.useReplica ?? false,
          "db.system": "postgresql",
          "db.operation": "SELECT",
        },
        traceId ? { traceId, spanId: requestId ?? traceId } : undefined
      );

      span.addEvent("query.plan.start");

      return { span, startTime: Date.now() };
    },

    /**
     * Called after join planning
     */
    onJoinPlanComplete(span: QuerySpan, plan: JoinPlan): void {
      span.setAttribute("query.join_depth", plan.maxDepth);
      span.addEvent("query.plan.complete", {
        baseEntity: plan.baseEntity,
        joinCount: plan.joins.length,
        maxDepth: plan.maxDepth,
      });
    },

    /**
     * Called after query execution
     */
    onQueryComplete<T>(
      span: QuerySpan,
      startTime: number,
      query: QueryRequest,
      plan: JoinPlan,
      result: QueryResponse<T>,
      tenantId: string,
      usedReplica: boolean,
      subjectType?: string
    ): void {
      const executionTimeMs = Date.now() - startTime;

      // Record metrics
      metrics.recordQueryExecution({
        entity: query.from,
        joinCount: plan.joins.length,
        joinDepth: plan.maxDepth,
        fieldCount: query.select.length,
        executionTimeMs,
        rowCount: result.data.length,
        usedReplica,
        includedCount: query.includeCount ?? false,
        tenantId,
        subjectType,
      });

      // Update span
      span.setAttribute("query.row_count", result.data.length);
      span.setAttribute("query.execution_time_ms", executionTimeMs);
      span.setStatus("ok");
      span.addEvent("query.complete", {
        rowCount: result.data.length,
        totalCount: result.totalCount,
      });
      span.end();

      // Log slow queries
      if (logSlowQueries && executionTimeMs > slowQueryThresholdMs) {
        logger.warn("Slow query detected", {
          entity: query.from,
          executionTimeMs,
          rowCount: result.data.length,
          joinCount: plan.joins.length,
          joinDepth: plan.maxDepth,
          threshold: slowQueryThresholdMs,
        });
      }
    },

    /**
     * Called on validation failure
     */
    onValidationFailure(
      query: QueryRequest,
      validation: QueryValidationResult,
      validationTimeMs: number
    ): void {
      metrics.recordQueryValidation({
        entity: query.from,
        valid: false,
        errorCodes: validation.errors.map((e) => e.code),
        validationTimeMs,
      });
    },

    /**
     * Called on query error
     */
    onQueryError(
      span: QuerySpan,
      startTime: number,
      query: QueryRequest,
      error: Error
    ): void {
      const executionTimeMs = Date.now() - startTime;

      metrics.recordQueryError({
        entity: query.from,
        errorType: error.name,
        errorMessage: error.message,
        executionTimeMs,
      });

      span.setStatus("error", error.message);
      span.addEvent("query.error", {
        errorType: error.name,
        errorMessage: error.message,
      });
      span.end();
    },

    /**
     * Get metrics snapshot
     */
    getMetrics(): QueryMetricsSnapshot {
      return metrics.getMetrics();
    },
  };
}
