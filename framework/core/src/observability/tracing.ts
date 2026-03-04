/**
 * Request correlation and distributed tracing
 * Provides request ID generation and propagation
 */

import { randomUUID } from "crypto";

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface RequestContext {
  requestId: string;
  traceContext?: TraceContext;
  startTime: Date;
  metadata: Record<string, unknown>;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Generate a trace ID (32 characters hex)
 */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * Generate a span ID (16 characters hex)
 */
export function generateSpanId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Parse trace context from headers (W3C Trace Context format)
 * Format: traceparent: 00-<trace-id>-<parent-span-id>-<trace-flags>
 */
export function parseTraceContext(
  traceparent?: string
): TraceContext | undefined {
  if (!traceparent) return undefined;

  const parts = traceparent.split("-");
  if (parts.length !== 4) return undefined;

  const [version, traceId, parentSpanId, flags] = parts;

  // Only support version 00
  if (version !== "00") return undefined;

  const sampled = (parseInt(flags, 16) & 0x01) === 0x01;

  return {
    traceId,
    spanId: generateSpanId(), // New span for this service
    parentSpanId,
    sampled,
  };
}

/**
 * Create traceparent header value
 */
export function createTraceparent(context: TraceContext): string {
  const flags = context.sampled ? "01" : "00";
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Request context storage (for async context)
 */
export class RequestContextStorage {
  private contexts = new Map<string, RequestContext>();

  /**
   * Create a new request context
   */
  create(options?: {
    requestId?: string;
    traceContext?: TraceContext;
    metadata?: Record<string, unknown>;
  }): RequestContext {
    const requestId = options?.requestId ?? generateRequestId();

    const context: RequestContext = {
      requestId,
      traceContext: options?.traceContext,
      startTime: new Date(),
      metadata: options?.metadata ?? {},
    };

    this.contexts.set(requestId, context);
    return context;
  }

  /**
   * Get a request context by ID
   */
  get(requestId: string): RequestContext | undefined {
    return this.contexts.get(requestId);
  }

  /**
   * Update request context metadata
   */
  update(requestId: string, metadata: Record<string, unknown>): void {
    const context = this.contexts.get(requestId);
    if (context) {
      context.metadata = { ...context.metadata, ...metadata };
    }
  }

  /**
   * Delete a request context
   */
  delete(requestId: string): void {
    this.contexts.delete(requestId);
  }

  /**
   * Clear all contexts (for testing)
   */
  clear(): void {
    this.contexts.clear();
  }

  /**
   * Get context count (for monitoring)
   */
  size(): number {
    return this.contexts.size;
  }
}

/**
 * Correlation ID utilities
 */
export const CorrelationHeaders = {
  REQUEST_ID: "x-request-id",
  TRACE_PARENT: "traceparent",
  TRACE_STATE: "tracestate",
} as const;

/**
 * Extract correlation IDs from headers
 */
export function extractCorrelationIds(headers: Record<string, string | string[] | undefined>): {
  requestId?: string;
  traceContext?: TraceContext;
} {
  const reqIdHeader = headers[CorrelationHeaders.REQUEST_ID];
  const requestId: string | undefined =
    typeof reqIdHeader === "string" ? reqIdHeader : undefined;

  const traceparentHeader = headers[CorrelationHeaders.TRACE_PARENT];
  const traceparent: string | undefined =
    typeof traceparentHeader === "string" ? traceparentHeader : undefined;

  const traceContext = parseTraceContext(traceparent);

  return { requestId, traceContext };
}

/**
 * Create correlation headers for outgoing requests
 */
export function createCorrelationHeaders(context: RequestContext): Record<string, string> {
  const headers: Record<string, string> = {
    [CorrelationHeaders.REQUEST_ID]: context.requestId,
  };

  if (context.traceContext) {
    headers[CorrelationHeaders.TRACE_PARENT] = createTraceparent(context.traceContext);
  }

  return headers;
}

/**
 * Sampling strategy
 */
export interface SamplingStrategy {
  shouldSample(context: RequestContext): boolean;
}

/**
 * Always sample
 */
export const AlwaysSample: SamplingStrategy = {
  shouldSample: () => true,
};

/**
 * Never sample
 */
export const NeverSample: SamplingStrategy = {
  shouldSample: () => false,
};

/**
 * Sample a percentage of requests
 */
export function createPercentageSampler(percentage: number): SamplingStrategy {
  return {
    shouldSample: () => Math.random() < percentage / 100,
  };
}

/**
 * Sample based on route patterns
 */
export function createRouteSampler(
  routes: Array<{ pattern: RegExp; sample: boolean }>
): SamplingStrategy {
  return {
    shouldSample: (context) => {
      const path = context.metadata.path as string | undefined;
      if (!path) return false;

      for (const route of routes) {
        if (route.pattern.test(path)) {
          return route.sample;
        }
      }

      return false;
    },
  };
}
