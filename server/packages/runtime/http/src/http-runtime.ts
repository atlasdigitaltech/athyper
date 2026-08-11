import { randomUUID } from "node:crypto";
import express, {
  type Application,
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import type { HealthContribution, HealthRegistry } from "@athyper/server-foundation/observability";

import { HttpError } from "./http-error.js";
import { sendProblem } from "./problem-details.js";
import { createOpenApiDocument, defineRouteContract, registerContractRoute, type RouteContract } from "./route-contract.js";

export interface HttpRuntimeOptions {
  readonly healthRegistry?: HealthRegistry;
  readonly jsonLimit?: string;
  readonly configure?: (application: Application) => void;
  readonly exposeErrorDetails?: boolean;
  readonly environment?: "local" | "staging" | "production";
  readonly onUnexpectedError?: (error: unknown, request: Request) => void;
  readonly requestDeadlineMs?: number;
  readonly rateLimit?: RateLimitOptions;
  readonly metrics?: {
    readonly exporter: {
      render(): string;
      histogram(name: string, description?: string): { record(value: number, labels?: Readonly<Record<string, string>>): void };
      counter(name: string, description?: string): { increment(labels?: Readonly<Record<string, string>>): void };
    };
    /** Set only when this application is bound to a dedicated internal listener. */
    readonly internalListener?: boolean;
  };
  readonly openApi?: false | {
    readonly title: string;
    readonly version: string;
    readonly path?: string;
    readonly docsPath?: string;
    readonly docsPermission?: string;
    readonly authorizeDocs?: RequestHandler;
  };
}

export interface RateLimitDecision {
  readonly count: number;
  readonly resetAt: number;
}

export interface RateLimitStore {
  consume(input: { readonly key: string; readonly windowMs: number; readonly now: number }): Promise<RateLimitDecision>;
}

export interface RateLimitOptions {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly exemptPaths?: readonly string[];
  readonly store?: RateLimitStore;
  readonly key?: (request: Request) => string;
  readonly onStoreError?: (error: unknown) => void;
}

const requestAbortSignals = new WeakMap<Request, AbortSignal>();
export function getRequestAbortSignal(request: Request): AbortSignal { return requestAbortSignals.get(request) ?? new AbortController().signal; }

export function createHttpApplication(options: HttpRuntimeOptions = {}): Application {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({limit:options.jsonLimit??"256kb",verify:(request,_response,buffer)=>{(request as Request&{rawBody?:Uint8Array}).rawBody=Uint8Array.from(buffer);}}));
  app.use((request, response, next) => {
    const requestId = headerValue(request, "x-request-id") ?? randomUUID();
    const correlationId = headerValue(request, "x-correlation-id");
    response.setHeader("X-Request-Id", requestId);
    runWithRequestContext(
      { requestId, ...(correlationId ? { correlationId } : {}) },
      next,
    );
  });
  if (options.requestDeadlineMs !== undefined) app.use(createRequestDeadlineMiddleware(options.requestDeadlineMs));
  if (options.rateLimit) app.use(createRateLimitMiddleware(options.rateLimit));
  if (options.metrics) {
    const duration = options.metrics.exporter.histogram("athyper_http_request_duration_seconds", "HTTP server request duration");
    const errors = options.metrics.exporter.counter("athyper_http_errors_total", "HTTP server error responses");
    app.use((request, response, next) => {
      const started = process.hrtime.bigint();
      response.once("finish", () => {
        const labels = { method: request.method, route: request.route?.path ?? "unmatched", status_class: `${Math.floor(response.statusCode / 100)}xx`, capability: "http" };
        duration.record(Number(process.hrtime.bigint() - started) / 1_000_000_000, labels);
        if (response.statusCode >= 500) errors.increment(labels);
      });
      next();
    });
  }

  registerContractRoute(app, systemContract("get", "/livez", "system.getLiveness"), (_request, response) => {
    response.status(200).json({ status: "alive", timestamp: new Date().toISOString() });
  });
  const readiness = async (_request: Request, response: Response): Promise<void> => {
    const checks = options.healthRegistry?.entries() ?? [];
    const results = await Promise.all(
      checks.map(async ([name, check]) => [name, await safeHealthCheck(check)] as const),
    );
    const status = results.some(([, result]) => result.status === "unhealthy")
      ? "unhealthy"
      : results.some(([, result]) => result.status === "degraded")
        ? "degraded"
        : "healthy";
    response.status(status === "unhealthy" ? 503 : 200).json({
      status,
      checks: Object.fromEntries(results),
    });
  };
  registerContractRoute(app, systemContract("get", "/readyz", "system.getReadiness"), readiness);
  registerContractRoute(app, systemContract("get", "/healthz", "system.getHealthz"), readiness);
  registerContractRoute(app, systemContract("get", "/health", "system.getHealth"), readiness);

  options.configure?.(app);
  if (options.metrics) {
    registerContractRoute(app, defineRouteContract({ method: "get", path: "/metrics", operationId: "telemetry.getPrometheusMetrics", summary: "Export Prometheus metrics", tags: ["Telemetry"], permission: "telemetry.metrics.read", responses: { 200: { description: "Prometheus text exposition" }, 403: { description: "Forwarded or external request rejected" } } }), (request, response) => {
      const forwarded = Boolean(headerValue(request, "forwarded") || headerValue(request, "x-forwarded-for") || headerValue(request, "x-forwarded-host"));
      const remote = request.socket.remoteAddress ?? "";
      const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
      if (forwarded || (!options.metrics!.internalListener && !loopback)) {
        sendProblem(response, request, new HttpError(403, "METRICS_ACCESS_DENIED", "Metrics are available only on the internal listener")); return;
      }
      response.status(200).type("text/plain; version=0.0.4; charset=utf-8").send(options.metrics!.exporter.render());
    });
  }
  if (options.openApi !== false) {
    const openApi = options.openApi ?? { title: "Athyper API", version: "0.1.0" };
    const artifactPath = openApi.path ?? "/openapi.json";
    app.get(artifactPath, (_request, response) => {
      response.json(createOpenApiDocument(app, openApi));
    });
    const docsEnabled = options.environment !== "production" || Boolean(openApi.authorizeDocs && openApi.docsPermission);
    if (docsEnabled) {
      const docs = (_request: Request, response: Response) => response.type("html").send(swaggerUi(openApi.title, artifactPath));
      app.get(openApi.docsPath ?? "/docs", ...(openApi.authorizeDocs ? [openApi.authorizeDocs, docs] : [docs]));
    }
  }
  app.use((request, response) => {
    sendProblem(response, request, new HttpError(404, "ROUTE_NOT_FOUND", "Route not found"));
  });
  const errors: ErrorRequestHandler = (error, request, response, _next) => {
    if (error instanceof HttpError) {
      sendProblem(response, request, error);
      return;
    }
    options.onUnexpectedError?.(error, request);
    sendProblem(response, request, new HttpError(500, "INTERNAL_ERROR",
      options.exposeErrorDetails && error instanceof Error ? error.message : "An unexpected error occurred"));
  };
  app.use(errors);
  return app;
}

function createRequestDeadlineMiddleware(timeoutMs: number): RequestHandler {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("HTTP request deadline must be a positive integer");
  return (request, response, next) => {
    const controller = new AbortController();
    requestAbortSignals.set(request, controller.signal);
    const abort = (reason: string) => { if (!controller.signal.aborted) controller.abort(new Error(reason)); };
    const timer = setTimeout(() => abort("HTTP request deadline exceeded"), timeoutMs);
    const cleanup = () => { clearTimeout(timer); request.off("aborted", onAborted); response.off("finish", cleanup); response.off("close", onClosed); };
    const onAborted = () => abort("HTTP client disconnected");
    const onClosed = () => { if (!response.writableEnded) abort("HTTP response closed"); cleanup(); };
    request.once("aborted", onAborted); response.once("finish", cleanup); response.once("close", onClosed);
    next();
  };
}

function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1 || !Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1) throw new Error("HTTP rate limit requires positive integer windowMs and maxRequests");
  const entries = new Map<string, { startedAt: number; count: number }>();
  const exempt = new Set(options.exemptPaths ?? []);
  return async (request, response, next) => {
    if (exempt.has(request.path)) { next(); return; }
    const now = Date.now();
    const key = options.key?.(request) ?? (request.ip || request.socket.remoteAddress || "unknown");
    let active: { count: number; resetAt: number };
    try {
      active = options.store
        ? await options.store.consume({ key, windowMs: options.windowMs, now })
        : consumeLocal(entries, key, now, options.windowMs);
    } catch (error) {
      options.onStoreError?.(error);
      active = consumeLocal(entries, key, now, options.windowMs);
    }
    response.setHeader("RateLimit-Limit", String(options.maxRequests));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, options.maxRequests - active.count)));
    if (active.count > options.maxRequests) { response.setHeader("Retry-After", String(Math.max(1, Math.ceil((active.resetAt - now) / 1_000)))); sendProblem(response, request, new HttpError(429, "RATE_LIMITED", "Too many requests")); return; }
    next();
  };
}

function consumeLocal(entries: Map<string, { startedAt: number; count: number }>, key: string, now: number, windowMs: number): RateLimitDecision {
  const entry = entries.get(key);
  const active = !entry || now - entry.startedAt >= windowMs ? { startedAt: now, count: 0 } : entry;
  active.count += 1;
  entries.set(key, active);
  if (entries.size > 10_000) for (const [candidate, value] of entries) if (now - value.startedAt >= windowMs) entries.delete(candidate);
  return { count: active.count, resetAt: active.startedAt + windowMs };
}

function systemContract(method: "get", path: string, operationId: string): RouteContract {
  return defineRouteContract({ method, path, operationId, summary: operationId, tags: ["System"], responses: { 200: { description: "Service status" }, 503: { description: "Service unavailable" } } });
}

function swaggerUi(title: string, artifactPath: string): string {
  const spec = JSON.stringify(artifactPath).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:${spec},dom_id:'#swagger-ui',deepLinking:true})</script></body></html>`;
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!); }

async function safeHealthCheck(
  check: () => Promise<HealthContribution>,
): Promise<HealthContribution> {
  try {
    return await check();
  } catch {
    return { status: "unhealthy", message: "Health check failed" };
  }
}

function headerValue(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return undefined;
  const normalized = first.trim();
  return normalized && normalized.length <= 128 ? normalized : undefined;
}
