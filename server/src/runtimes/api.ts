// server/src/runtimes/api.ts
//
// HTTP API runtime entry point.
//
// Receives the ServerDeps bag from bootstrap(), wires the Express application,
// registers all service routes, and begins serving on config.port.
//
// Invariants:
//   - No adapter construction here — all infrastructure comes from deps.
//   - No domain logic — routes and services live in svc-* packages.
//   - Adding a new service = one registerXxxRoutes() call in this file only.
//   - No workers started here — IAM outbox runs in MODE=worker,
//     BullMQ schedulers run in MODE=scheduler.

import express, { type Request, type Response, type NextFunction } from "express";
import { Router } from "express";

import { registerIamRoutes } from "@athyper/svc-iam";
import { registerMetadataRoutes } from "@athyper/svc-metadata";
import { registerRecordsRoutes } from "@athyper/svc-records";
import { registerDocumentsRoutes } from "@athyper/svc-documents";
import { registerCollabRoutes } from "@athyper/svc-collab";
import { registerFinanceRoutes } from "@athyper/svc-finance";
import {
  registerPlatformRoutes,
  registerRefRoutes,
  registerTaxonomyRoutes,
  registerClassificationRoutes,
  registerCommerceRoutes,
  registerNotificationRoutes,
} from "@athyper/svc-platform";
import { registerJobsRoutes } from "@athyper/svc-jobs";
import { registerJobsAdminRoutes } from "../../framework/runtime/services/jobs/routes/jobs.admin.route.js";

import { registerWorkflowRoutes } from "../../framework/runtime/services/workflow/routes/index.js";
import { registerPolicyRoutes } from "../../framework/runtime/services/policy/routes/index.js";
import { registerAuditRoutes } from "../../framework/runtime/services/audit/routes/index.js";
import { registerContentRoutes } from "../../framework/runtime/services/content/routes/index.js";
import { ClamavScanner } from "../../framework/runtime/services/content/services/clamav.service.js";
import { registerIntegrationRoutes } from "../../framework/runtime/services/integration/routes/index.js";
import { registerDocServicesRoutes } from "../../framework/runtime/services/docservices/routes/index.js";
import { createOpenApiRouter } from "../../framework/runtime/openapi/openapi-generator.js";

import { createCacheMetrics, metricsHandler, registerJobQueues } from "../metrics.js";
import { makeAuditEvent } from "../audit.js";
import { runWithContext } from "../kernel/request-context.js";
import type { ServerDeps } from "../kernel/bootstrap.js";

// ─── Health types ─────────────────────────────────────────────────────────────

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface HealthContribution {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
}

type HealthCheck = () => Promise<HealthContribution>;

// ─── startApi ─────────────────────────────────────────────────────────────────

/**
 * Wire and start the HTTP API runtime.
 *
 * Call order:
 *   1. Build iamCache from redis (shared between IAM routes and platform routes).
 *   2. Register health checks (db, redis, jwks, objectStorage).
 *   3. Build Express app + middleware.
 *   4. Register all service routes.
 *   5. Warm up JWKS.
 *   6. Install signal handlers (SIGTERM, SIGINT).
 *   7. Begin listening.
 */
export async function startApi(deps: ServerDeps): Promise<void> {
  const startedAt = Date.now();
  const {
    config,
    logger,
    lifecycle,
    db,
    redis,
    auth,
    objectStorageRef,
    jobs,
    audit,
    breakers,
    serviceHealthChecks,
    credentialEncryption,
    mentionService,
  } = deps;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _db = db.kysely as unknown as import("kysely").Kysely<Record<string, any>>;

  // Register BullMQ queues for /metrics queue depth gauges.
  // Cast to Record<string, unknown> — DepthQueue duck-type is satisfied by BullMQ Queue.
  registerJobQueues(jobs.queues as unknown as Parameters<typeof registerJobQueues>[0]);

  // ─── IAM cache client ──────────────────────────────────────────────────────
  // Provides the full CacheClient surface used by IAM and platform routes:
  // basic ops + P2 set ops (sadd/srem/smembers/expire) for session tracking.
  const iamCache = {
    get: (k: string) => redis.get(k),
    set: (k: string, v: string, _ex: "EX", ttl: number) =>
      redis.set(k, v, "EX", ttl),
    del: (k: string | string[]) => redis.del(k as string),
    scan: (
      cursor: string,
      matchFlag: "MATCH",
      pattern: string,
      countFlag: "COUNT",
      count: number,
    ) =>
      (
        redis as unknown as {
          scan(cursor: string, ...args: unknown[]): Promise<[string, string[]]>;
        }
      ).scan(cursor, matchFlag, pattern, countFlag, count),
    sadd: (k: string, member: string) => redis.sadd(k, member),
    srem: (k: string, member: string) => redis.srem(k, member),
    smembers: (k: string) => redis.smembers(k),
    expire: (k: string, ttl: number) => redis.expire(k, ttl),
  } as Parameters<typeof registerIamRoutes>[1]["cache"];

  // ─── Health checks ────────────────────────────────────────────────────────
  // Three-level contract: healthy | degraded | unhealthy
  //   healthy    — all contributors up, normal operation
  //   degraded   — partial degradation, serving with reduced capability
  //   unhealthy  — critical contributor down, cannot serve correctly → 503

  // Phase 1.3: health checks include both adapter checks (below) and service
  // checks registered by individual services via deps.registry.registerHealthCheck().
  // The serviceHealthChecks map reference comes from bootstrap and is shared.
  const healthChecks = new Map<string, HealthCheck>([...(serviceHealthChecks ?? [])]);

  healthChecks.set("db", async () => {
    // Phase 1.5: circuit state overrides the live probe when OPEN
    if (breakers?.db.getState() === "OPEN") {
      return { status: "degraded", message: "circuit OPEN — db connections failing" };
    }
    try {
      const t = Date.now();
      const result = await db.health();
      return {
        status: result.healthy ? "healthy" : "unhealthy",
        message: result.message,
        latencyMs: Date.now() - t,
      };
    } catch (err) {
      breakers?.db.forceOpen();
      return { status: "unhealthy", message: String(err) };
    }
  });

  healthChecks.set("redis", async () => {
    if (breakers?.redis.getState() === "OPEN") {
      return { status: "degraded", message: "circuit OPEN — redis unreachable" };
    }
    try {
      const t = Date.now();
      await redis.ping();
      return { status: "healthy", latencyMs: Date.now() - t };
    } catch (err) {
      breakers?.redis.forceOpen();
      return { status: "unhealthy", message: String(err) };
    }
  });

  healthChecks.set("jwks", async () => {
    if (breakers?.auth.getState() === "OPEN") {
      return { status: "degraded", message: "circuit OPEN — auth unreachable" };
    }
    const jwksHealth = auth.getJwksHealth();
    const allHealthy = Object.values(jwksHealth).every(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.healthy !== false,
    );
    return { status: allHealthy ? "healthy" : "degraded" };
  });

  healthChecks.set("objectStorage", async () => {
    if (!objectStorageRef.current) {
      return { status: "degraded", message: "object storage not configured" };
    }
    if (breakers?.objectStorage.getState() === "OPEN") {
      return { status: "degraded", message: "circuit OPEN — object storage failing" };
    }
    try {
      const t = Date.now();
      const result = await objectStorageRef.current.healthCheck();
      return {
        status: result.healthy ? "healthy" : "degraded",
        message: result.message,
        latencyMs: Date.now() - t,
      };
    } catch (err) {
      return { status: "degraded", message: String(err) };
    }
  });

  // ─── Express app ──────────────────────────────────────────────────────────

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  // ─── Request context ──────────────────────────────────────────────────────
  // Stamps every request with an x-request-id and starts an AsyncLocalStorage
  // context so all downstream middleware and route handlers can call
  // getContext() / tryGetContext() without needing explicit prop-drilling.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const requestId =
      (req.headers["x-request-id"] as string) ?? crypto.randomUUID();
    req.headers["x-request-id"] = requestId;
    runWithContext({ requestId }, next);
  });

  // ─── Health probe ──────────────────────────────────────────────────────────

  const healthHandler = (_req: Request, res: Response): void => {
    void (async () => {
      try {
        // Merge adapter checks + live service checks (registered after startup)
        const allChecks = new Map<string, HealthCheck>([
          ...healthChecks,
          ...(serviceHealthChecks ?? []),
        ]);
        const checks: Record<string, HealthContribution> = {};
        await Promise.all(
          [...allChecks.entries()].map(async ([name, check]) => {
            checks[name] = await check();
          }),
        );

        const statuses = Object.values(checks).map((c) => c.status);
        const overall: HealthStatus = statuses.includes("unhealthy")
          ? "unhealthy"
          : statuses.includes("degraded")
            ? "degraded"
            : "healthy";

        res.status(overall === "unhealthy" ? 503 : 200).json({
          status: overall,
          checks,
          ts: Date.now(),
        });
      } catch (err) {
        logger.error("health_check_error", { err: String(err) });
        res.status(503).json({
          status: "unhealthy",
          error: "health_check_failed",
          ts: Date.now(),
        });
      }
    })();
  };

  app.get("/healthz", healthHandler);
  app.get("/health", healthHandler);

  // ─── API routes ────────────────────────────────────────────────────────────

  const apiRouter = Router();

  // ── KC admin token factory (client_credentials grant) ─────────────────────
  // Derives the KC base URL from the issuer URL by stripping /realms/{realm}.
  // Used by WebAuthn AIA routes and MFA sync to call KC Admin REST API.
  const kcBaseUrl = config.iam.issuerUrl
    .replace(/\/realms\/[^/]+\/?$/, "")
    .replace(/\/$/, "");

  let _cachedAdminToken: { token: string; expiresAt: number } | null = null;
  const getKcAdminToken = async (): Promise<string> => {
    const now = Date.now();
    if (_cachedAdminToken && _cachedAdminToken.expiresAt > now + 30_000) {
      return _cachedAdminToken.token;
    }
    const tokenUrl = `${kcBaseUrl}/realms/${config.iam.realm}/protocol/openid-connect/token`;
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     config.iam.clientId,
        client_secret: config.iam.clientSecret,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`KC admin token fetch failed: ${resp.status} — ${body}`);
    }
    const data = await resp.json() as { access_token: string; expires_in: number };
    _cachedAdminToken = {
      token:     data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };
    return data.access_token;
  };

  registerIamRoutes(apiRouter, {
    db: db.kysely,
    cache: iamCache,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
    sessionMetrics: createCacheMetrics("session"),
    bootstrapMetrics: createCacheMetrics("bootstrap"),
    kc: {
      baseUrl:       kcBaseUrl,
      realm:         config.iam.realm,
      clientId:      config.iam.clientId,
      getAdminToken: getKcAdminToken,
    },
  });

  registerMetadataRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerRecordsRoutes(apiRouter, {
    db:           db.kysely,
    auth:         { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
    objectStorage: objectStorageRef.current ?? undefined,
  });

  registerDocumentsRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    objectStorage: objectStorageRef.current
      ? {
          adapter: objectStorageRef.current,
          bucket: config.objectStorage!.bucket,
          maxUploadMb: config.objectStorage!.maxUploadMb,
        }
      : undefined,
    logger,
  });

  registerCollabRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    mentionService,
    redis,
    logger,
  });

  registerPlatformRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    cache: iamCache,
    logger,
  });

  registerRefRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerTaxonomyRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerClassificationRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerCommerceRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerFinanceRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerWorkflowRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerPolicyRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerJobsRoutes(apiRouter, {
    queues: jobs.queues,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerJobsAdminRoutes(apiRouter, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queues: jobs.queues as any,
    db:     _db,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerAuditRoutes(apiRouter, {
    db: _db,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    storage: objectStorageRef.current,
    logger,
  });

  registerContentRoutes(apiRouter, {
    db: _db,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    objectStorage: objectStorageRef.current
      ? {
          adapter:     objectStorageRef.current,
          bucket:      config.objectStorage!.bucket,
          maxUploadMb: config.objectStorage!.maxUploadMb,
        }
      : undefined,
    previewQueue:  jobs.queues.cmsPreview,
    virusScanner:  config.clamd
      ? new ClamavScanner({
          host:          config.clamd.host,
          port:          config.clamd.port,
          timeoutMs:     config.clamd.timeoutMs,
          onUnavailable: config.clamd.onUnavailable,
        })
      : undefined,
    logger,
  });

  registerIntegrationRoutes(apiRouter, {
    db: _db,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
    credentialEncryption: credentialEncryption ?? undefined,
  });

  registerNotificationRoutes(apiRouter, {
    db: _db,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  registerDocServicesRoutes(apiRouter, {
    db: _db,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
  });

  app.use("/api", apiRouter);

  // ─── OpenAPI / Swagger UI ──────────────────────────────────────────────────
  // Serves /openapi.json, /openapi.yaml, and /docs (Swagger UI).
  // Unauthenticated — documentation is not sensitive and CI tooling needs it.
  app.use("/", createOpenApiRouter());

  // ─── Prometheus metrics ────────────────────────────────────────────────────
  // /metrics is on the same port as the API but only reachable on the internal
  // Docker network (Traefik does not route /metrics to the public edge).
  app.get("/metrics", metricsHandler);

  // ─── 404 + error handlers ──────────────────────────────────────────────────

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("unhandled_error", { err: err.message, stack: err.stack });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message:
        config.env !== "production" ? err.message : "Internal server error",
      ...(config.env !== "production" && { stack: err.stack }),
    });
  });

  // ─── Startup ──────────────────────────────────────────────────────────────

  await audit.write(
    makeAuditEvent({
      type: "server.boot.start",
      level: "info",
      actor: { kind: "system" },
      meta: { env: config.env, port: config.port, realm: config.iam.realm, pid: process.pid, mode: "api" },
    }),
  );

  // Warm up JWKS — avoids blocking the first real request on a cold JWKS fetch.
  await auth
    .warmUp()
    .catch((err) =>
      logger.warn("jwks_warmup_failed", { err: String(err) }),
    );

  // ─── Signal handlers ───────────────────────────────────────────────────────
  // Use once() so repeated signals don't re-enter shutdown.

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutdown_signal", {
      signal,
      pid: process.pid,
      mode: "api",
      uptimeMs: Date.now() - startedAt,
    });

    await audit.write(
      makeAuditEvent({
        type: "server.shutdown",
        level: "info",
        actor: { kind: "system" },
        meta: { signal, uptimeMs: Date.now() - startedAt },
      }),
    );

    await Promise.race([
      lifecycle.shutdown(signal),
      new Promise<void>((resolve) =>
        setTimeout(resolve, config.shutdownTimeoutMs),
      ),
    ]);

    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  // ─── Listen ───────────────────────────────────────────────────────────────

  app.listen(config.port, () => {
    logger.info("server_started", {
      port: config.port,
      env: config.env,
      realm: config.iam.realm,
      issuer: config.iam.issuerUrl,
      pid: process.pid,
      mode: "api",
    });

    void audit.write(
      makeAuditEvent({
        type: "server.boot.success",
        level: "info",
        actor: { kind: "system" },
        meta: { port: config.port, env: config.env },
      }),
    );

    // Phase 1.3: fire onReady callbacks after the server is listening
    void lifecycle.signalReady();
  });
}
