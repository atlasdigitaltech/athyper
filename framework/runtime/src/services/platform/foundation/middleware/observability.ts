/**
 * Express middleware for observability
 * Adds request correlation, metrics, and health checks
 */

import {
  extractCorrelationIds,
  generateRequestId,
  generateTraceId,
  generateSpanId,
  CorrelationHeaders,
  createTraceparent,
} from "@athyper/core";

import type { Logger } from "../../../../kernel/logger.js";
import type { DependencyHealth, MetricsRegistry, RequestContextStorage } from "@athyper/core";
import type { Request, Response, NextFunction } from "express";


/**
 * Request correlation middleware
 * Adds request ID and trace context to all requests
 */
export function correlationMiddleware(
  storage: RequestContextStorage,
  options?: {
    headerName?: string;
    generateIfMissing?: boolean;
  }
) {
  const headerName = options?.headerName ?? CorrelationHeaders.REQUEST_ID;
  const generateIfMissing = options?.generateIfMissing ?? true;

  return (req: Request, res: Response, next: NextFunction) => {
    // Extract correlation IDs from headers
    const { requestId: existingRequestId, traceContext: existingTraceContext } =
      extractCorrelationIds(req.headers);

    // Generate request ID if missing
    const requestId = existingRequestId ?? (generateIfMissing ? generateRequestId() : undefined);

    if (!requestId) {
      return next();
    }

    // Create or use existing trace context
    let traceContext = existingTraceContext;
    if (!traceContext && generateIfMissing) {
      traceContext = {
        traceId: generateTraceId(),
        spanId: generateSpanId(),
        sampled: true,
      };
    }

    // Store request context
    const context = storage.create({
      requestId,
      traceContext,
      metadata: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    // Attach to request object
    (req as any).requestContext = context;

    // Add correlation headers to response
    res.setHeader(headerName, requestId);
    if (traceContext) {
      res.setHeader(CorrelationHeaders.TRACE_PARENT, createTraceparent(traceContext));
    }

    // Cleanup context after response
    res.on("finish", () => {
      storage.delete(requestId);
    });

    next();
  };
}

/**
 * Metrics middleware
 * Collects request metrics (duration, status, errors)
 */
export function metricsMiddleware(
  registry: MetricsRegistry,
  options?: {
    excludePaths?: RegExp[];
  }
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip excluded paths
    if (options?.excludePaths?.some((pattern) => pattern.test(req.path))) {
      return next();
    }

    const start = Date.now();

    // Increment active requests
    registry.setGauge("http_requests_active", 1);

    // Record response metrics when finished
    res.on("finish", () => {
      const duration = Date.now() - start;
      const method = req.method;
      const path = req.route?.path ?? req.path;
      const status = res.statusCode;

      // Record request
      registry.incrementCounter("http_requests_total", 1, {
        method,
        path,
        status: String(status),
      });

      // Record duration
      registry.recordHistogram("http_request_duration_ms", duration, {
        method,
        path,
      });

      // Record errors
      if (status >= 400) {
        registry.incrementCounter("http_errors_total", 1, {
          method,
          path,
          status: String(status),
        });
      }

      // Decrement active requests
      registry.setGauge("http_requests_active", -1);
    });

    next();
  };
}

/**
 * Logging middleware
 * Structured request/response logging with correlation
 */
export function loggingMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const context = (req as any).requestContext;

    // Log incoming request
    logger.info({
      msg: "http_request_start",
      method: req.method,
      path: req.path,
      requestId: context?.requestId,
      traceId: context?.traceContext?.traceId,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    // Log response when finished
    res.on("finish", () => {
      const duration = Date.now() - start;

      const logData = {
        msg: "http_request_complete",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        requestId: context?.requestId,
        traceId: context?.traceContext?.traceId,
      };

      if (res.statusCode >= 500) {
        logger.error(logData);
      } else if (res.statusCode >= 400) {
        logger.warn(logData);
      } else {
        logger.info(logData);
      }
    });

    next();
  };
}

/**
 * Health check endpoint factory
 */
export function createHealthEndpoints(
  healthRegistry: any,
  options?: {
    version?: string;
  }
) {
  return {
    /**
     * Basic liveness check
     * Returns 200 if the server is running
     */
    async liveness(req: Request, res: Response) {
      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    },

    /**
     * Comprehensive health check
     * Returns system health including all dependencies
     */
    async health(req: Request, res: Response) {
      try {
        const health = await healthRegistry.getSystemHealth({
          version: options?.version,
        });

        const statusCode = health.status === "healthy" ? 200 : 503;

        res.status(statusCode).json({
          status: health.status,
          version: health.version,
          uptime: health.uptime,
          timestamp: health.timestamp,
          dependencies: health.dependencies.map((dep: DependencyHealth) => ({
            name: dep.name,
            type: dep.type,
            required: dep.required,
            status: dep.result.status,
            message: dep.result.message,
            duration: dep.result.duration,
          })),
        });
      } catch (error) {
        res.status(503).json({
          status: "unhealthy",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      }
    },

    /**
     * Readiness check
     * Returns 200 only if all required dependencies are healthy
     */
    async readiness(req: Request, res: Response) {
      try {
        const isReady = await healthRegistry.isReady();

        if (isReady) {
          res.status(200).json({
            status: "ready",
            timestamp: new Date().toISOString(),
          });
        } else {
          const health = await healthRegistry.getSystemHealth();
          const failedDeps = health.dependencies
            .filter((d: DependencyHealth) => d.required && d.result.status !== "healthy")
            .map((d: DependencyHealth) => d.name);

          res.status(503).json({
            status: "not_ready",
            failed_dependencies: failedDeps,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        res.status(503).json({
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      }
    },
  };
}
