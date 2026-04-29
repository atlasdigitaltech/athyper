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

import { registerIamRoutes, checkPermissionBatch } from "@athyper/svc-iam";
import { registerMetadataRoutes } from "@athyper/svc-metadata";
import { registerRecordsRoutes } from "@athyper/svc-records";
import { registerSearchRoutes } from "@athyper/svc-search";
import { registerDocumentsRoutes } from "@athyper/svc-documents";
import { registerCollabRoutes } from "@athyper/svc-collab";
import { registerCollabAttachmentRoutes } from "../../framework/runtime/services/collab/routes/collab-attachments.route.js";
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
import { registerJobsBoardRoutes } from "../../framework/runtime/services/jobs/routes/jobs.board.route.js";

import { registerWorkflowRoutes } from "../../framework/runtime/services/workflow/routes/index.js";
import { registerPolicyRoutes } from "../../framework/runtime/services/policy/routes/index.js";
import { registerAuditRoutes } from "../../framework/runtime/services/audit/routes/index.js";
import { registerContentRoutes } from "../../framework/runtime/services/content/routes/index.js";
import { ClamavScanner } from "../../framework/runtime/services/content/services/clamav.service.js";
import { registerIntegrationRoutes } from "../../framework/runtime/services/integration/routes/index.js";
import { registerDocServicesRoutes } from "../../framework/runtime/services/docservices/routes/index.js";
import { createOpenApiRouter } from "../../framework/runtime/openapi/openapi-generator.js";
import {
  createAiServiceBundle,
  registerAiRoutes,
} from "../../framework/runtime/services/ai/index.js";

import { createCacheMetrics, metricsHandler, registerJobQueues } from "../metrics.js";
import { makeAuditEvent } from "../audit.js";
import { runComplianceSuiteIfDev } from "../foundation/metadata/entity-compliance.js";
import { createEntityCompilerService } from "../foundation/metadata/entity-compiler.service.js";
import { runWithContext, tryGetContext } from "../kernel/request-context.js";
import type { ServerDeps } from "../kernel/bootstrap.js";
import { livenessHandler } from "./liveness.js";

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
 *   5. Install signal handlers (SIGTERM, SIGINT).
 *   6. Begin listening.
 *   7. lifecycle.signalReady() fires JWKS warm-up as an onReady() handler.
 *      /readyz returns 503 (jwks_warming) until warm-up settles.
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

  // B.3 — /readyz gates on JWKS warm-up completion. Warm-up itself runs
  // inside a lifecycle.onReady() handler registered further down; until that
  // handler resolves, the contributor reports "unhealthy" so /readyz returns
  // 503 and upstream load balancers hold traffic.
  let jwksWarmupCompleted = false;

  healthChecks.set("jwks", async () => {
    if (!jwksWarmupCompleted) {
      return { status: "unhealthy", message: "jwks_warming" };
    }
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

  // ─── Health probes ─────────────────────────────────────────────────────────
  //
  // F4: Three distinct probe endpoints:
  //   /livez  — process alive, event loop responsive, no dependency checks.
  //             Target for Docker Compose healthcheck (avoid restart on dep flap).
  //   /readyz — full aggregate health (all dependencies). Target for load
  //             balancer health and orchestrator readiness gates.
  //   /health, /healthz — aliases for /readyz (backward-compatible).

  // Liveness: just confirms the event loop is ticking. Always 200.
  // Handler is isolated in runtimes/liveness.ts so it structurally cannot
  // close over db/redis/auth — see that file for the F4 rationale.
  app.get("/livez", livenessHandler);

  // Readiness: full aggregate health — all dependency checks.
  const readinessHandler = (_req: Request, res: Response): void => {
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

  app.get("/readyz", readinessHandler);
  app.get("/healthz", readinessHandler);
  app.get("/health", readinessHandler);

  // Forward-auth endpoint for the Traefik gateway. Mounted on `app` (not
  // apiRouter) to bypass the X-Org tenant-stamp middleware — Traefik forwards
  // only the Authorization header. Verifies the bearer token and returns
  // X-User-Id / X-User-Roles / X-Tenant-Id headers consumed by downstream
  // routers. See stack/config/gateway/environments/neon-workbench-routes.staging.yml.
  app.get("/api/auth/verify", (req: Request, res: Response): void => {
    void (async () => {
      const authHeader = req.headers["authorization"] ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) {
        res.status(401).end();
        return;
      }
      try {
        const claims = await auth.verifyToken(match[1]!);
        const sub      = typeof claims["sub"]       === "string" ? claims["sub"]       : "";
        const tenantId = typeof claims["tenant_id"] === "string" ? claims["tenant_id"] : "";

        const roles: string[] = [];
        const realmAccess = claims["realm_access"] as Record<string, unknown> | undefined;
        if (Array.isArray(realmAccess?.["roles"])) {
          roles.push(...(realmAccess["roles"] as string[]));
        }
        const resourceAccess = claims["resource_access"] as Record<string, Record<string, unknown>> | undefined;
        if (resourceAccess && typeof resourceAccess === "object") {
          for (const client of Object.values(resourceAccess)) {
            if (Array.isArray(client?.["roles"])) {
              roles.push(...(client["roles"] as string[]));
            }
          }
        }
        if (Array.isArray(claims["groups"])) {
          roles.push(...(claims["groups"] as string[]));
        }

        res.setHeader("X-User-Id",    sub);
        res.setHeader("X-User-Roles", [...new Set(roles)].join(","));
        res.setHeader("X-Tenant-Id",  tenantId);
        res.status(200).end();
      } catch {
        res.status(401).end();
      }
    })();
  });

  // ─── API routes ────────────────────────────────────────────────────────────

  const apiRouter = Router();

  // ── Tenant-stamp middleware ────────────────────────────────────────────────
  // Reads X-Org, resolves tenant UUID from master.tenant (open_read policy —
  // no GUC needed), and mutates the ALS context so the TenantStampDriver can
  // set app.current_tenant_id on every downstream DB query.
  // Without this, FORCE ROW LEVEL SECURITY tables (legal_entity, company_code,
  // supplier, etc.) return 0 rows even when WHERE tenant_id = ? is applied.
  apiRouter.use(async (req: Request, _res: Response, next: NextFunction) => {
    const xOrg   = (req.headers["x-org"]   as string) ?? "";
    const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
    if (xOrg) {
      const tenantCode = xOrg.split("--")[0];
      if (tenantCode) {
        try {
          const row = await _db
            .selectFrom("master.tenant as t")
            .select("t.id")
            .where("t.code",      "=", tenantCode)
            .where("t.realm_key", "=", xRealm || "athyper")
            .executeTakeFirst();
          if (row) {
            const ctx = tryGetContext();
            if (ctx) ctx.tenantId = row.id as string;
          }
        } catch { /* swallow — route handlers will 401/404 appropriately */ }
      }
    }
    next();
  });

  // ── KC admin token factory ────────────────────────────────────────────────
  // Derives the KC base URL from the issuer URL by stripping /realms/{realm}.
  // Used by WebAuthn AIA routes and MFA sync to call KC Admin REST API.
  //
  // Strategy (in order):
  //   1. Master-realm password grant (KC_ADMIN_USERNAME + KC_ADMIN_PASSWORD) —
  //      full admin access, works immediately without role mapping setup.
  //   2. Realm client_credentials grant (clientId + clientSecret) —
  //      requires realm-management roles assigned to the service account.
  const kcBaseUrl = config.iam.issuerUrl
    .replace(/\/realms\/[^/]+\/?$/, "")
    .replace(/\/$/, "");

  const kcAdminUsername = process.env.KC_ADMIN_USERNAME ?? process.env.KEYCLOAK_ADMIN_USERNAME ?? "athyperadmin";
  const kcAdminPassword = process.env.KC_ADMIN_PASSWORD ?? process.env.KEYCLOAK_ADMIN_PASSWORD ?? "athyperadmin";

  let _cachedAdminToken: { token: string; expiresAt: number } | null = null;
  const getKcAdminToken = async (): Promise<string> => {
    const now = Date.now();
    if (_cachedAdminToken && _cachedAdminToken.expiresAt > now + 30_000) {
      return _cachedAdminToken.token;
    }

    // Prefer master realm password grant — full admin access without role config
    const masterTokenUrl = `${kcBaseUrl}/realms/master/protocol/openid-connect/token`;
    const resp = await fetch(masterTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id:  "admin-cli",
        username:   kcAdminUsername,
        password:   kcAdminPassword,
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
      webClientId:   process.env.KEYCLOAK_WEB_CLIENT_ID ?? "neon-web",
      getAdminToken: getKcAdminToken,
    },
  });

  registerMetadataRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
    checkPermissionBatch,
  });

  registerRecordsRoutes(apiRouter, {
    db:           db.kysely,
    auth:         { verifyToken: (token: string) => auth.verifyToken(token) },
    logger,
    objectStorage: objectStorageRef.current ?? undefined,
  });

  // Track B2 — cross-entity search. `search` is null when Meilisearch is
  // not configured; the route returns 503 in that case.
  registerSearchRoutes(apiRouter, {
    db:     db.kysely,
    auth:   { verifyToken: (token: string) => auth.verifyToken(token) },
    search: deps.searchService,
    logger,
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
    tikaQueue: jobs.queues.tikaExtract,
    logger,
  });

  registerCollabRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    mentionService,
    redis,
    logger,
  });

  registerCollabAttachmentRoutes(apiRouter, {
    db: db.kysely,
    auth: { verifyToken: (token: string) => auth.verifyToken(token) },
    objectStorage: config.objectStorage
      ? { adapterRef: objectStorageRef, bucket: config.objectStorage.bucket, maxUploadMb: config.objectStorage.maxUploadMb }
      : undefined,
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

  // Embedded BullBoard UI at /api/jobs/admin/board — gated by
  // JOBS.BOARD.VIEW (read) and JOBS.QUEUE.MANAGE (mutate). The standalone
  // `deadly0/bull-board:3` container is retained as an internal-only
  // break-glass fallback under compose profile `emergency`.
  registerJobsBoardRoutes(apiRouter, {
    queues: jobs.queues,
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

  // ─── AI Foundation routes ──────────────────────────────────────────────────
  // Phase 7a: POST /ai/actions/run | /preview, POST /ai/feedback,
  //           GET /ai/policy/effective
  // ANTHROPIC_API_KEY must be set in env to enable real model calls.
  const aiBundle = await createAiServiceBundle({ db: _db, redis, logger });
  registerAiRoutes(apiRouter, {
    db:    _db,
    auth:  { verifyToken: (token: string) => auth.verifyToken(token) as Promise<{ sub: string; [k: string]: unknown }> },
    aiRuntime:          aiBundle.aiRuntime,
    autonomyResolver:   aiBundle.autonomyResolver,
    confidenceResolver: aiBundle.confidenceResolver,
    feedbackLogWriter:  aiBundle.feedbackLogWriter,
    logger,
  });

  app.use("/api", apiRouter);

  // ─── OpenAPI / Swagger UI ──────────────────────────────────────────────────
  // Serves /openapi.json, /openapi.yaml, and /docs (Swagger UI — dev only).
  // In production the spec is Bearer-gated: it's a map of every endpoint,
  // tenant-header contract, and schema field — useful for reconnaissance.
  // Local/staging stay open so openapi-client generators + CI can pull it.
  app.use("/", createOpenApiRouter({
    requireAuth: process.env["NODE_ENV"] === "production",
    authVerify:  (token: string) => auth.verifyToken(token),
  }));

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

  // B.3 — JWKS warm-up is a readiness dependency, not a boot gate.
  // Register it as an onReady() handler so boot is non-blocking; /readyz
  // reports "jwks_warming" (unhealthy) until this promise settles.
  lifecycle.onReady(async () => {
    try {
      await auth.warmUp();
      logger.info("jwks_warmup_completed");
    } catch (err) {
      logger.warn("jwks_warmup_failed", { err: String(err) });
    } finally {
      jwksWarmupCompleted = true;
    }
  });

  // RUNTIME_ROUTING_SPEC §10 — Entity compliance suite (dev/staging only).
  // Compiles all system entities first so snapshot.entity_compiled rows exist,
  // then validates the 10-point checklist. Never blocks boot or affects /readyz.
  lifecycle.onReady(async () => {
    await createEntityCompilerService(_db).compileAllSystemEntities();
    await runComplianceSuiteIfDev(_db, logger);
  });

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
