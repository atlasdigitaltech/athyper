import { randomUUID } from "node:crypto";
import express, {
  type Application,
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { runWithRequestContext, tryGetRequestContext } from "@athyper/server-foundation/context";
import type { HealthContribution, HealthRegistry } from "@athyper/server-foundation/observability";

import { HttpError } from "./http-error.js";
import { sendProblem } from "./problem-details.js";
import { assertRouteContracts, configureContractRouteMiddleware, createOpenApiDocument, defineRouteContract, enforceContractResponses, registerContractRoute, type RouteContract } from "./route-contract.js";

export interface HttpRuntimeOptions {
  readonly healthRegistry?: HealthRegistry;
  /** Maximum wait per dependency check; defaults to 2 seconds. */
  readonly healthCheckTimeoutMs?: number;
  /** Host startup gate; dependencies are checked only after initialization completes. */
  readonly isReady?: () => boolean;
  readonly jsonLimit?: string;
  /** Trusted route overrides; :id matches a UUID segment only. Other routes retain the global JSON limit. */
  readonly jsonRouteLimits?: readonly {readonly method: "POST" | "PUT" | "PATCH"; readonly path: string; readonly maxBytes: number}[];
  readonly configure?: (application: Application) => void;
  readonly exposeErrorDetails?: boolean;
  readonly environment?: "local" | "staging" | "production";
  readonly onUnexpectedError?: (error: unknown, request: Request) => void;
  readonly requestDeadlineMs?: number;
  readonly drainController?: HttpDrainController;
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
    /** Common headers consumed by the host authentication middleware. */
    readonly authenticatedHeaders?: import("./route-contract.js").RuntimeSchema;
    readonly docsPermission?: string;
    readonly authorizeDocs?: RequestHandler;
    /** Fail application construction when a configured Express route has no route contract. */
    readonly enforceContracts?: boolean;
    /** Validate JSON response statuses and bodies against route contracts at runtime. */
    readonly enforceResponses?: boolean;
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
  /** Source limits run before routing; tenant-principal limits run after a contracted route authenticates. */
  readonly scope?: "source" | "tenant-principal";
  /** Optional source ceiling layered over tenant-principal limits, including for legacy raw routes. */
  readonly sourceMaxRequests?: number;
  readonly identity?: (request: Request) => { readonly tenantId: string; readonly principalId: string } | undefined;
  readonly onStoreError?: (error: unknown) => void;
}

/** Tracks in-flight HTTP work so shutdown can stop admission, drain streams, then cancel stragglers. */
export class HttpDrainController {
  readonly #active = new Set<AbortController>();
  readonly #waiters = new Set<(drained: boolean) => void>();
  #draining = false;

  get isDraining(): boolean { return this.#draining; }
  get activeRequests(): number { return this.#active.size; }
  beginDrain(): void { this.#draining = true; this.#notifyIfDrained(); }
  abortActive(reason: unknown = new Error("HTTP server is shutting down")): void {
    for (const controller of this.#active) if (!controller.signal.aborted) controller.abort(reason);
  }
  async waitForDrain(timeoutMs: number): Promise<boolean> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new TypeError("HTTP drain timeout must be a non-negative integer");
    if (this.#active.size === 0) return true;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (drained: boolean) => { if (settled) return; settled = true; clearTimeout(timer); this.#waiters.delete(finish); resolve(drained); };
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.#waiters.add(finish);
    });
  }
  track(controller: AbortController): () => void {
    this.#active.add(controller);
    return () => { this.#active.delete(controller); this.#notifyIfDrained(); };
  }
  #notifyIfDrained(): void { if (this.#active.size === 0) for (const waiter of [...this.#waiters]) waiter(true); }
}

const requestAbortSignals = new WeakMap<Request, AbortSignal>();
export function getRequestAbortSignal(request: Request): AbortSignal { return requestAbortSignals.get(request) ?? new AbortController().signal; }

export function createHttpApplication(options: HttpRuntimeOptions = {}): Application {
  const healthCheckTimeoutMs = options.healthCheckTimeoutMs ?? 2_000;
  if (!Number.isSafeInteger(healthCheckTimeoutMs) || healthCheckTimeoutMs < 1) throw new TypeError("Health check timeout must be a positive integer");
  const pendingChecks = new WeakMap<() => Promise<HealthContribution>, Promise<HealthContribution>>();
  const app = express();
  const openApi = options.openApi === false ? undefined : options.openApi ?? { title: "Athyper API", version: "0.1.0" };
  app.disable("x-powered-by");
  app.use(createRequestCancellationMiddleware(options.requestDeadlineMs, options.drainController));
  const captureBody = (request: import("node:http").IncomingMessage, _response: import("node:http").ServerResponse, buffer: Buffer) => {(request as Request&{rawBody?:Uint8Array}).rawBody=Uint8Array.from(buffer);};
  const parseJson = express.json({limit:options.jsonLimit??"256kb",verify:captureBody});
  const routeParsers = new Map<string, ReturnType<typeof express.json>>();
  for (const limit of options.jsonRouteLimits ?? []) {
    const key = `${limit.method} ${limit.path}`;
    if (!["POST", "PUT", "PATCH"].includes(limit.method) || !/^\/api\/[A-Za-z0-9/_-]+$/.test(limit.path.replace(/\/:id(?=\/|$)/g, "/id")) || limit.path.endsWith("/") || !Number.isSafeInteger(limit.maxBytes) || limit.maxBytes < 1 || routeParsers.has(key)) throw new TypeError("Invalid or duplicate JSON route limit");
    routeParsers.set(key, express.json({limit:limit.maxBytes,verify:captureBody}));
  }
  app.use((request, response, next) => {
    // Webhook signatures cover the original bytes; the route owns parsing and limits.
    if (request.method === "POST" && /^\/api\/webhooks\/[^/]+\/?$/i.test(request.path)) {
      next();
      return;
    }
    const routePath=request.path.replace(/\/$/, "");
    const uuidTemplate=routePath.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,"/:id");
    (routeParsers.get(`${request.method} ${routePath}`) ?? routeParsers.get(`${request.method} ${uuidTemplate}`) ?? parseJson)(request, response, next);
  });
  app.use((request, response, next) => {
    const requestId = headerValue(request, "x-request-id") ?? randomUUID();
    const correlationId = headerValue(request, "x-correlation-id");
    response.setHeader("X-Request-Id", requestId);
    runWithRequestContext(
      { requestId, ...(correlationId ? { correlationId } : {}) },
      next,
    );
  });
  if (options.rateLimit?.scope === "tenant-principal") {
    if (options.rateLimit.sourceMaxRequests !== undefined) app.use(createRateLimitMiddleware({ ...options.rateLimit, scope: "source", maxRequests: options.rateLimit.sourceMaxRequests }));
    configureContractRouteMiddleware(app, { authenticated: createRateLimitMiddleware(options.rateLimit) });
  } else if (options.rateLimit) app.use(createRateLimitMiddleware(options.rateLimit));
  if (openApi?.enforceResponses) enforceContractResponses(app);
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
    if (options.drainController?.isDraining || options.isReady?.() === false) {
      response.status(503).json({ status: "unhealthy", checks: {} });
      return;
    }
    const checks = options.healthRegistry?.entries() ?? [];
    const results = await Promise.all(
      checks.map(async ([name, check]) => [name, await safeHealthCheck(check, healthCheckTimeoutMs, pendingChecks)] as const),
    );
    const status = options.drainController?.isDraining || options.isReady?.() === false || results.some(([, result]) => result.status === "unhealthy")
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
  if (openApi?.enforceContracts) assertRouteContracts(app);
  if (openApi) {
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
    // Express JSON parsing runs before route handlers; malformed bodies never
    // reach the route's validation error mapping.
    if (error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed") {
      sendProblem(response, request, new HttpError(400, "INVALID_JSON", "Request body must contain valid JSON"));
      return;
    }
    if (error instanceof Error && "type" in error) {
      if (error.type === "entity.too.large") {
        sendProblem(response, request, new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds the allowed size"));
        return;
      }
      if (error.type === "encoding.unsupported" || error.type === "charset.unsupported") {
        sendProblem(response, request, new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Request body encoding is unsupported"));
        return;
      }
    }
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

function createRequestCancellationMiddleware(timeoutMs: number | undefined, drain: HttpDrainController | undefined): RequestHandler {
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)) throw new Error("HTTP request deadline must be a positive integer");
  return (request, response, next) => {
    const probe = (request.method === "GET" || request.method === "HEAD") && /^\/(livez|readyz|healthz|health)\/?$/i.test(request.path);
    if (probe) response.setHeader("Cache-Control", "no-store");
    if (drain?.isDraining && !probe) {
      response.setHeader("Connection", "close");
      sendProblem(response, request, new HttpError(503, "SERVER_DRAINING", "The server is draining and cannot accept new requests"));
      return;
    }
    const controller = new AbortController();
    requestAbortSignals.set(request, controller.signal);
    const abort = (reason: string) => { if (!controller.signal.aborted) controller.abort(new Error(reason)); };
    const untrack = drain?.track(controller);
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => abort("HTTP request deadline exceeded"), timeoutMs);
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; if (timer) clearTimeout(timer); untrack?.(); request.off("aborted", onAborted); response.off("finish", cleanup); response.off("close", onClosed); };
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
    const key = options.key?.(request) ?? rateLimitKey(request, options);
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

function rateLimitKey(request: Request, options: RateLimitOptions): string {
  if (options.scope !== "tenant-principal") return `source:${request.ip || request.socket.remoteAddress || "unknown"}`;
  const context = options.identity?.(request) ?? tryGetRequestContext();
  if (!context?.tenantId || !context.principalId) throw new HttpError(500, "RATE_LIMIT_IDENTITY_MISSING", "Authenticated rate limiting requires tenant and principal context");
  return `tenant:${context.tenantId}:principal:${context.principalId}`;
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
  const liveness = path === "/livez";
  const body = liveness
    ? { type: "object", required: ["status", "timestamp"], properties: { status: { const: "alive" }, timestamp: { type: "string" } }, additionalProperties: false }
    : { type: "object", required: ["status", "checks"], properties: {
      status: { enum: ["healthy", "degraded", "unhealthy"] },
      checks: { type: "object", additionalProperties: { type: "object", required: ["status"], properties: {
        status: { enum: ["healthy", "degraded", "unhealthy"] }, message: { type: "string" }, latencyMs: { type: "number" },
      } } },
    }, additionalProperties: false };
  const summary = liveness ? "Process liveness (independent of dependencies)"
    : path === "/readyz" ? "Readiness: healthy or degraded returns 200; unavailable returns 503"
      : "Compatibility alias of GET /readyz (identical checks and status codes)";
  const responses: Record<number, RouteContract["responses"][number]> = {
    200: { description: liveness ? "Process is alive" : "Service is healthy or degraded", body },
  };
  if (!liveness) responses[503] = { description: "Service is starting, draining, or a dependency is unhealthy", body };
  return defineRouteContract({ method, path, operationId, summary, tags: ["System"], responses });
}

function swaggerUi(title: string, artifactPath: string): string {
  const spec = JSON.stringify(artifactPath).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:${spec},dom_id:'#swagger-ui',deepLinking:true})</script></body></html>`;
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!); }

async function safeHealthCheck(
  check: () => Promise<HealthContribution>,
  timeoutMs: number,
  pending: WeakMap<() => Promise<HealthContribution>, Promise<HealthContribution>>,
): Promise<HealthContribution> {
  let work = pending.get(check);
  if (!work) {
    work = Promise.resolve().then(check).then((result): HealthContribution => {
      if (!result || !["healthy", "degraded", "unhealthy"].includes(result.status)) {
        return { status: "unhealthy", message: "Invalid health check result" };
      }
      return result;
    }).catch((): HealthContribution => ({ status: "unhealthy", message: "Health check failed" }))
      .finally(() => pending.delete(check));
    pending.set(check, work);
  }
  // Keep timed-out work registered until it settles: probes must not pile up
  // more database/network operations behind an already stuck dependency.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<HealthContribution>((resolve) => {
        timer = setTimeout(() => resolve({ status: "unhealthy", message: "Health check timed out" }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function headerValue(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return undefined;
  const normalized = first.trim();
  return normalized && normalized.length <= 128 ? normalized : undefined;
}
