/**
 * Policy Evaluation Observability
 *
 * E: Observability (mandatory in runtime)
 * - Metrics: policy_eval_total, policy_eval_denied_total, policy_eval_latency_ms, cache hit ratio
 * - Tracing spans: compile, fetchFacts, evaluate, resolveDecision
 * - Structured logs: tenantId, policyId, action, decision, latency
 */

import type { PolicyInput, PolicyDecision } from "./types.js";

// ============================================================================
// Metrics Interface
// ============================================================================

/**
 * Metric labels
 */
export type MetricLabels = {
  tenant_id: string;
  action: string;
  resource_type: string;
  effect?: string;
  error_code?: string;
};

/**
 * Metrics collector interface
 */
export interface IMetricsCollector {
  /** Increment a counter */
  incrementCounter(name: string, labels?: MetricLabels): void;

  /** Record a histogram value */
  recordHistogram(name: string, value: number, labels?: MetricLabels): void;

  /** Record a gauge value */
  recordGauge(name: string, value: number, labels?: MetricLabels): void;
}

/**
 * Default metrics collector (console-based for development)
 */
export class ConsoleMetricsCollector implements IMetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  incrementCounter(name: string, labels?: MetricLabels): void {
    const key = this.buildKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  recordHistogram(name: string, value: number, labels?: MetricLabels): void {
    const key = this.buildKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  recordGauge(name: string, value: number, labels?: MetricLabels): void {
    const key = this.buildKey(name, labels);
    this.gauges.set(key, value);
  }

  private buildKey(name: string, labels?: MetricLabels): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  /** Get current metrics snapshot (for testing/debugging) */
  getSnapshot(): {
    counters: Record<string, number>;
    histograms: Record<string, { count: number; sum: number; avg: number; p95: number }>;
    gauges: Record<string, number>;
  } {
    const histogramStats: Record<string, { count: number; sum: number; avg: number; p95: number }> = {};

    for (const [key, values] of this.histograms) {
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      histogramStats[key] = {
        count: values.length,
        sum,
        avg: sum / values.length,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      };
    }

    return {
      counters: Object.fromEntries(this.counters),
      histograms: histogramStats,
      gauges: Object.fromEntries(this.gauges),
    };
  }
}

// ============================================================================
// Tracing Interface
// ============================================================================

/**
 * Span context
 */
export type SpanContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
};

/**
 * Span attributes
 */
export type SpanAttributes = Record<string, string | number | boolean | undefined>;

/**
 * Span interface
 */
export interface ISpan {
  /** Set span attribute */
  setAttribute(key: string, value: string | number | boolean): void;

  /** Add event to span */
  addEvent(name: string, attributes?: SpanAttributes): void;

  /** Set span status */
  setStatus(status: "ok" | "error", message?: string): void;

  /** End the span */
  end(): void;

  /** Get span context */
  getContext(): SpanContext;
}

/**
 * Tracer interface
 */
export interface ITracer {
  /** Start a new span */
  startSpan(name: string, attributes?: SpanAttributes, parent?: SpanContext): ISpan;

  /** Get current active span */
  getActiveSpan(): ISpan | undefined;
}

/**
 * No-op span for when tracing is disabled
 */
class NoOpSpan implements ISpan {
  private context: SpanContext;

  constructor() {
    this.context = {
      traceId: crypto.randomUUID(),
      spanId: crypto.randomUUID().slice(0, 16),
    };
  }

  setAttribute(_key: string, _value: string | number | boolean): void {}
  addEvent(_name: string, _attributes?: SpanAttributes): void {}
  setStatus(_status: "ok" | "error", _message?: string): void {}
  end(): void {}
  getContext(): SpanContext {
    return this.context;
  }
}

/**
 * Console-based tracer for development
 */
export class ConsoleTracer implements ITracer {
  private activeSpan?: ISpan;

  startSpan(name: string, attributes?: SpanAttributes, parent?: SpanContext): ISpan {
    const span = new ConsoleSpan(name, attributes, parent);
    this.activeSpan = span;
    return span;
  }

  getActiveSpan(): ISpan | undefined {
    return this.activeSpan;
  }
}

/**
 * Console-based span for development
 */
class ConsoleSpan implements ISpan {
  private context: SpanContext;
  private startTime: number;
  private attributes: SpanAttributes = {};
  private events: Array<{ name: string; timestamp: number; attributes?: SpanAttributes }> = [];
  private status: "ok" | "error" = "ok";
  private statusMessage?: string;

  constructor(
    private name: string,
    initialAttributes?: SpanAttributes,
    parent?: SpanContext
  ) {
    this.startTime = Date.now();
    this.context = {
      traceId: parent?.traceId ?? crypto.randomUUID(),
      spanId: crypto.randomUUID().slice(0, 16),
      parentSpanId: parent?.spanId,
    };
    if (initialAttributes) {
      this.attributes = { ...initialAttributes };
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    this.events.push({ name, timestamp: Date.now(), attributes });
  }

  setStatus(status: "ok" | "error", message?: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  end(): void {
    const duration = Date.now() - this.startTime;

    console.log(
      JSON.stringify({
        trace: {
          name: this.name,
          traceId: this.context.traceId,
          spanId: this.context.spanId,
          parentSpanId: this.context.parentSpanId,
          startTime: new Date(this.startTime).toISOString(),
          duration,
          status: this.status,
          statusMessage: this.statusMessage,
          attributes: this.attributes,
          events: this.events,
        },
      })
    );
  }

  getContext(): SpanContext {
    return this.context;
  }
}

/**
 * No-op tracer
 */
export class NoOpTracer implements ITracer {
  startSpan(_name: string, _attributes?: SpanAttributes, _parent?: SpanContext): ISpan {
    return new NoOpSpan();
  }

  getActiveSpan(): ISpan | undefined {
    return undefined;
  }
}

// ============================================================================
// Structured Logging
// ============================================================================

/**
 * Log level
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Policy evaluation log entry
 */
export type PolicyEvalLog = {
  /** Log level */
  level: LogLevel;

  /** Message */
  msg: string;

  /** Timestamp */
  timestamp: Date;

  /** Tenant ID */
  tenantId: string;

  /** Principal ID */
  principalId: string;

  /** Action code */
  action: string;

  /** Resource type */
  resourceType: string;

  /** Resource ID */
  resourceId?: string;

  /** Decision effect */
  effect?: string;

  /** Evaluation duration in ms */
  durationMs?: number;

  /** Matched rule ID */
  matchedRuleId?: string;

  /** Matched policy ID */
  matchedPolicyId?: string;

  /** Error code */
  errorCode?: string;

  /** Error message */
  errorMessage?: string;

  /** Correlation ID */
  correlationId?: string;

  /** Additional context */
  context?: Record<string, unknown>;
};

/**
 * Logger interface
 */
export interface IPolicyLogger {
  /** Log evaluation start */
  logEvalStart(input: PolicyInput): void;

  /** Log evaluation complete */
  logEvalComplete(input: PolicyInput, decision: PolicyDecision): void;

  /** Log evaluation error */
  logEvalError(input: PolicyInput, error: Error, durationMs: number): void;

  /** Log cache hit/miss */
  logCacheAccess(cacheType: string, hit: boolean, key: string): void;
}

/**
 * Structured JSON logger
 */
export class StructuredPolicyLogger implements IPolicyLogger {
  constructor(private readonly enabled: boolean = true) {}

  logEvalStart(input: PolicyInput): void {
    if (!this.enabled) return;

    console.log(
      JSON.stringify({
        msg: "policy_eval_start",
        timestamp: new Date().toISOString(),
        tenantId: input.context.tenantId,
        principalId: input.subject.principalId,
        action: input.action.fullCode,
        resourceType: input.resource.type,
        resourceId: input.resource.id,
        correlationId: input.context.correlationId,
      })
    );
  }

  logEvalComplete(input: PolicyInput, decision: PolicyDecision): void {
    if (!this.enabled) return;

    console.log(
      JSON.stringify({
        msg: "policy_eval_complete",
        timestamp: new Date().toISOString(),
        tenantId: input.context.tenantId,
        principalId: input.subject.principalId,
        action: input.action.fullCode,
        resourceType: input.resource.type,
        resourceId: input.resource.id,
        effect: decision.effect,
        allowed: decision.allowed,
        durationMs: decision.metadata.durationMs,
        matchedRuleId: decision.decidingRule?.ruleId,
        matchedPolicyId: decision.decidingRule?.policyId,
        rulesMatched: decision.matchedRules.length,
        correlationId: input.context.correlationId,
      })
    );
  }

  logEvalError(input: PolicyInput, error: Error, durationMs: number): void {
    if (!this.enabled) return;

    console.error(
      JSON.stringify({
        msg: "policy_eval_error",
        timestamp: new Date().toISOString(),
        tenantId: input.context.tenantId,
        principalId: input.subject.principalId,
        action: input.action.fullCode,
        resourceType: input.resource.type,
        resourceId: input.resource.id,
        durationMs,
        errorCode: (error as any).code,
        errorMessage: error.message,
        correlationId: input.context.correlationId,
      })
    );
  }

  logCacheAccess(cacheType: string, hit: boolean, key: string): void {
    if (!this.enabled) return;

    console.log(
      JSON.stringify({
        msg: "policy_cache_access",
        timestamp: new Date().toISOString(),
        cacheType,
        hit,
        key: key.slice(0, 50), // Truncate key for logging
      })
    );
  }
}

// ============================================================================
// Observability Manager
// ============================================================================

/**
 * Policy observability configuration
 */
export type PolicyObservabilityConfig = {
  /** Enable metrics */
  metricsEnabled: boolean;

  /** Enable tracing */
  tracingEnabled: boolean;

  /** Enable structured logging */
  loggingEnabled: boolean;

  /** Log level threshold */
  logLevel: LogLevel;
};

const DEFAULT_OBSERVABILITY_CONFIG: PolicyObservabilityConfig = {
  metricsEnabled: true,
  tracingEnabled: false,
  loggingEnabled: true,
  logLevel: "info",
};

/**
 * Policy Observability Manager
 * Central hub for all observability concerns
 */
export class PolicyObservability {
  readonly metrics: IMetricsCollector;
  readonly tracer: ITracer;
  readonly logger: IPolicyLogger;
  private readonly config: PolicyObservabilityConfig;

  constructor(
    config?: Partial<PolicyObservabilityConfig>,
    metrics?: IMetricsCollector,
    tracer?: ITracer,
    logger?: IPolicyLogger
  ) {
    this.config = { ...DEFAULT_OBSERVABILITY_CONFIG, ...config };

    this.metrics = metrics ?? new ConsoleMetricsCollector();
    this.tracer = this.config.tracingEnabled
      ? (tracer ?? new ConsoleTracer())
      : new NoOpTracer();
    this.logger = logger ?? new StructuredPolicyLogger(this.config.loggingEnabled);
  }

  /**
   * Record evaluation metrics
   */
  recordEvaluation(input: PolicyInput, decision: PolicyDecision): void {
    if (!this.config.metricsEnabled) return;

    const labels: MetricLabels = {
      tenant_id: input.context.tenantId,
      action: input.action.fullCode,
      resource_type: input.resource.type,
      effect: decision.effect,
    };

    // Counter: total evaluations
    this.metrics.incrementCounter("policy_eval_total", labels);

    // Counter: denied evaluations
    if (decision.effect === "deny") {
      this.metrics.incrementCounter("policy_eval_denied_total", labels);
    }

    // Histogram: latency
    this.metrics.recordHistogram(
      "policy_eval_latency_ms",
      decision.metadata.durationMs,
      labels
    );

    // Gauge: matched rules
    this.metrics.recordGauge(
      "policy_eval_rules_matched",
      decision.matchedRules.length,
      labels
    );
  }

  /**
   * Record cache metrics
   */
  recordCacheAccess(cacheType: "subject" | "policy" | "facts", hit: boolean): void {
    if (!this.config.metricsEnabled) return;

    this.metrics.incrementCounter("policy_cache_access_total", {
      tenant_id: "system",
      action: "cache_access",
      resource_type: cacheType,
    });

    if (hit) {
      this.metrics.incrementCounter("policy_cache_hit_total", {
        tenant_id: "system",
        action: "cache_hit",
        resource_type: cacheType,
      });
    }
  }

  /**
   * Record evaluation error
   */
  recordError(input: PolicyInput, errorCode: string): void {
    if (!this.config.metricsEnabled) return;

    this.metrics.incrementCounter("policy_eval_error_total", {
      tenant_id: input.context.tenantId,
      action: input.action.fullCode,
      resource_type: input.resource.type,
      error_code: errorCode,
    });
  }

  /**
   * Start a traced evaluation
   */
  startEvaluationSpan(input: PolicyInput): ISpan {
    return this.tracer.startSpan("policy.evaluate", {
      tenantId: input.context.tenantId,
      principalId: input.subject.principalId,
      action: input.action.fullCode,
      resourceType: input.resource.type,
    });
  }

  /**
   * Create child span
   */
  startChildSpan(name: string, parent: SpanContext, attributes?: SpanAttributes): ISpan {
    return this.tracer.startSpan(name, attributes, parent);
  }
}

/**
 * Create observability instance with default settings
 */
export function createPolicyObservability(
  config?: Partial<PolicyObservabilityConfig>
): PolicyObservability {
  return new PolicyObservability(config);
}
