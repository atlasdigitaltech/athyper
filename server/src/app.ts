/**
 * Athyper Runtime API Server
 *
 * Express server that exposes the platform runtime API alongside the Next.js BFF.
 * The BFF calls this server-to-server for session resolution, metadata, records,
 * documents, finance, collab, and platform services.
 *
 * Start in dev:   tsx watch server/src/app.ts
 * Start in prod:  node dist/src/app.js
 *
 * Required env vars (copy server/.env.example → server/.env):
 *   DATABASE_URL              — PostgreSQL via PgBouncer
 *   REDIS_URL                 — redis://:password@host:port/db
 *   KEYCLOAK_BASE_URL         — https://iam.mesh.athyper.local  (local dev)
 *   KEYCLOAK_REALM            — athyper                         (local dev)
 *   KEYCLOAK_CLIENT_ID        — athyper-api                     (local dev)
 *   IAM_ISSUER_URL            — full issuer URL                 (Docker mesh)
 *   PORT                      — 4000 (default)
 *
 * Optional:
 *   LOG_LEVEL                 — fatal|error|warn|info|debug|trace (default: info)
 *   ATHYPER_ENV               — local|staging|production         (default: local)
 *   SHUTDOWN_TIMEOUT_MS       — graceful shutdown window         (default: 15000)
 *   PLATFORM_CONTROL_ENABLED  — enable platform-control realm    (default: false)
 */

import "dotenv/config"; // MUST be first — populates process.env before loadConfig()

import express, { type Request, type Response, type NextFunction } from "express";
import { Router } from "express";

import { loadConfig } from "./config.js";
import {
  loadKernelConfig,
  getDefaultRealm,
  buildAdditionalRealms,
} from "./kernel-config.js";
import { createLogger } from "./logger.js";
import { Lifecycle } from "./lifecycle.js";
import { createCacheMetrics, metricsHandler } from "./metrics.js";
import {
  createConsoleAuditWriter,
  createDbAuditWriter,
  makeAuditEvent,
  type AuditWriter,
} from "./audit.js";

import { createDbAdapter } from "@athyper/adapter-db";
import { createRedisClient } from "@athyper/adapter-memorycache";
import { createAuthAdapter } from "@athyper/adapter-auth";
import {
  createS3ObjectStorageAdapter,
  type ObjectStorageAdapter,
} from "@athyper/adapter-objectstorage";

import { registerIamRoutes, createIamOutboxWorker } from "@athyper/svc-iam";
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
import {
  createJobsService,
  registerJobsRoutes,
  createWfOutboxHandler,
  type NotificationChannelHandler,
} from "@athyper/svc-jobs";
import { createEmailAdapter } from "../framework/runtime/services/jobs/adapters/email.adapter.js";
import { createWebhookAdapter } from "../framework/runtime/services/jobs/adapters/webhook.adapter.js";
import { registerWorkflowRoutes } from "../framework/runtime/services/workflow/routes/index.js";
import { registerPolicyRoutes } from "../framework/runtime/services/policy/routes/index.js";
import { registerAuditRoutes } from "../framework/runtime/services/audit/routes/index.js";
import { registerContentRoutes } from "../framework/runtime/services/content/routes/index.js";
import { registerIntegrationRoutes } from "../framework/runtime/services/integration/routes/index.js";

// ─── Config ───────────────────────────────────────────────────────────────────
// Fail fast: validate all env vars before creating any adapters or starting Express.
// A clear validation error here is far better than a cryptic crash mid-request.

const config = loadConfig();

// ─── Kernel config (optional — only when running inside Docker mesh) ──────────
// Provides multi-realm IAM, feature flags, and tenant hierarchy from the
// JSON file at ${MESH_CONFIG}/${ATHYPER_KERNEL_CONFIG_PATH}.
// Falls back gracefully to env-var-only IAM when the path is not set.

const kernelConfig = loadKernelConfig();

// ─── Logger ───────────────────────────────────────────────────────────────────

const logger = createLogger({ level: config.logLevel, env: config.env });

if (kernelConfig) {
  logger.info("kernel_config_loaded", {
    env: kernelConfig.env,
    strategy: kernelConfig.iam.strategy,
    defaultRealmKey: kernelConfig.iam.defaultRealmKey,
    realms: Object.keys(kernelConfig.iam.realms),
  });
} else {
  logger.warn("kernel_config_absent", {
    message:
      "ATHYPER_KERNEL_CONFIG_PATH not set — running in env-var-only IAM mode",
  });
}

// ─── Fatal process handlers ───────────────────────────────────────────────────
// Installed immediately — before adapter creation — so any async failure during
// bootstrap is captured rather than crashing silently.

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Don't force exit — let the in-flight request/job complete; the process will
  // surface the problem via the next health check if adapters are broken.
});

process.on("uncaughtException", (err) => {
  logger.fatal("uncaught_exception", { err: err.message, stack: err.stack });
  process.exit(1);
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────
// Shutdown handlers are registered LIFO as adapters/workers come online.
// The actual signal wiring happens inside start() once all components exist.

const lifecycle = new Lifecycle();

// ─── Audit ────────────────────────────────────────────────────────────────────
// Console writer in local dev — set to DB writer after dbAdapter is created below.
// Route handlers use writeRouteAudit() directly from audit.ts for entity mutations.

let audit: AuditWriter = createConsoleAuditWriter();

// ─── Adapters ─────────────────────────────────────────────────────────────────

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "6379", 10),
    // Redis 6+ ACL: include username so ioredis sends AUTH <user> <pass>.
    // Empty string means "default user" — omit it so we don't override the ACL default.
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: parseInt(u.pathname.replace(/^\//, "") || "0", 10),
  };
}

const dbAdapter = createDbAdapter({
  connectionString: config.db.url,
  poolMax: config.db.poolMax,
});
lifecycle.onShutdown(() => dbAdapter.close());

const redis = createRedisClient({
  ...parseRedisUrl(config.redis.url),
  connectTimeout:       config.redis.connectTimeout,
  maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
  errorLogCooldownMs:   config.redis.errorLogCooldownMs,
  logger,
});
lifecycle.onShutdown(() => redis.disconnect());

// When kernel config is available use its realm IAM (richer: allowedAzp,
// multi-realm). Otherwise fall back to the flat env-var IAM config.
const defaultRealm = kernelConfig ? getDefaultRealm(kernelConfig) : null;

const auth = createAuthAdapter({
  issuerUrl: defaultRealm?.iam.issuerUrl ?? config.iam.issuerUrl,
  clientId:  defaultRealm?.iam.clientId  ?? config.iam.clientId,
  clientSecret: defaultRealm?.iam.clientSecret ?? config.iam.clientSecret,
  additionalRealms: kernelConfig
    ? buildAdditionalRealms(kernelConfig)
    : undefined,
  redisClient: {
    get: (k: string) => redis.get(k),
    setex: (k: string, s: number, v: string) => redis.setex(k, s, v),
  },
  logger,
});

// ─── Object storage (optional) ────────────────────────────────────────────────
// When S3_ENDPOINT is absent the adapter is null and attachment routes return
// 503 with STORAGE_UNAVAILABLE. The health contributor is "degraded" (not
// "unhealthy") so a missing S3 config does not block startup.

let objectStorageAdapter: ObjectStorageAdapter | null = null;
if (config.objectStorage) {
  objectStorageAdapter = createS3ObjectStorageAdapter({
    ...config.objectStorage,
    logger,
  });
  logger.info("object_storage_configured", {
    endpoint: config.objectStorage.endpoint,
    bucket:   config.objectStorage.bucket,
  });
} else {
  logger.warn("object_storage_not_configured", {
    message: "S3_ENDPOINT absent — attachment routes will return 503",
  });
}

// Bucket existence + permission validation — runs once at startup, before
// the server begins accepting requests.  Failure is logged but non-fatal:
// the health check will surface "degraded" and attachment routes return 503.
// This gives a clear startup message instead of a cryptic per-request error.
if (objectStorageAdapter) {
  objectStorageAdapter.validateBucketAccess()
    .then(() => {
      logger.info("object_storage_bucket_validated", {
        bucket: config.objectStorage!.bucket,
        endpoint: config.objectStorage!.endpoint,
      });
    })
    .catch((err: unknown) => {
      logger.error("object_storage_bucket_validation_failed", {
        bucket:   config.objectStorage!.bucket,
        endpoint: config.objectStorage!.endpoint,
        err:      err instanceof Error ? err.message : String(err),
      });
      // Null out the adapter so routes degrade gracefully (503) rather than
      // failing with opaque S3 errors on every attachment request.
      objectStorageAdapter = null;
    });
}

// ─── Jobs service ─────────────────────────────────────────────────────────────
// Created before routes so queues are available for the admin API.
// Schedulers are activated inside start() via jobs.start().

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db = dbAdapter.kysely as unknown as import("kysely").Kysely<Record<string, any>>;

// Swap to DB audit writer now that dbAdapter is ready (non-local envs)
if (config.env !== "local") {
  audit = createDbAuditWriter(_db);
}

const inAppChannelHandler: NotificationChannelHandler = {
  // in_app delivery is the record itself — no external dispatch needed.
  // The notification_delivery row is the notification; the frontend reads it directly.
  send: async () => ({ externalId: undefined }),
  healthCheck: async () => "healthy",
};

const channelHandlers = new Map<string, NotificationChannelHandler>([
  ["in_app", inAppChannelHandler],
  ["webhook", createWebhookAdapter()],
  ...(config.email
    ? [["email", createEmailAdapter({
        host:         config.email.host,
        port:         config.email.port,
        secure:       config.email.secure ?? false,
        user:         config.email.user,
        pass:         config.email.pass,
        from_address: config.email.from_address,
      })] as [string, NotificationChannelHandler]]
    : []),
]);

const jobsService = createJobsService({
  db:       _db,
  redisUrl: config.redis.url,
  logger,
  topicHandlers:   new Map([["wf", createWfOutboxHandler(_db)]]),
  channelHandlers,
});

// ─── Health ───────────────────────────────────────────────────────────────────
// Three-level contract: healthy | degraded | unhealthy
//   healthy    — all contributors up, normal operation
//   degraded   — partial degradation, serving with reduced capability
//   unhealthy  — critical contributor down, cannot serve correctly → 503

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface HealthContribution {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
}

type HealthCheck = () => Promise<HealthContribution>;

const healthChecks = new Map<string, HealthCheck>();

healthChecks.set("db", async () => {
  try {
    const t = Date.now();
    const result = await dbAdapter.health();
    return {
      status: result.healthy ? "healthy" : "unhealthy",
      message: result.message,
      latencyMs: Date.now() - t,
    };
  } catch (err) {
    return { status: "unhealthy", message: String(err) };
  }
});

healthChecks.set("redis", async () => {
  try {
    const t = Date.now();
    await redis.ping();
    return { status: "healthy", latencyMs: Date.now() - t };
  } catch (err) {
    return { status: "unhealthy", message: String(err) };
  }
});

healthChecks.set("jwks", async () => {
  const jwksHealth = auth.getJwksHealth();
  const allHealthy = Object.values(jwksHealth).every(
    (r: any) => r.healthy !== false,
  );
  return { status: allHealthy ? "healthy" : "degraded" };
});

healthChecks.set("objectStorage", async () => {
  if (!objectStorageAdapter) {
    return { status: "degraded", message: "object storage not configured" };
  }
  try {
    const t      = Date.now();
    const result = await objectStorageAdapter.healthCheck();
    return {
      status:    result.healthy ? "healthy" : "degraded",
      message:   result.message,
      latencyMs: Date.now() - t,
    };
  } catch (err) {
    return { status: "degraded", message: String(err) };
  }
});

// Outbox contributor — flag is set true once the worker is started in start()
let outboxRunning = false;
healthChecks.set("outbox", async () => ({
  status: outboxRunning ? "healthy" : "unhealthy",
  message: outboxRunning ? undefined : "not running",
}));

// Jobs contributor — flag is set true once the jobs service is started in start()
let jobsRunning = false;
healthChecks.set("jobs", async () => ({
  status: jobsRunning ? "healthy" : "degraded",
  message: jobsRunning ? undefined : "not running",
}));

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.headers["x-request-id"]) {
    req.headers["x-request-id"] = crypto.randomUUID();
  }
  next();
});

// ─── Health probe ─────────────────────────────────────────────────────────────

const healthHandler = (_req: Request, res: Response): void => {
  void (async () => {
    try {
      const checks: Record<string, HealthContribution> = {};
      await Promise.all(
        [...healthChecks.entries()].map(async ([name, check]) => {
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
      res
        .status(503)
        .json({ status: "unhealthy", error: "health_check_failed", ts: Date.now() });
    }
  })();
};

app.get("/healthz", healthHandler);
app.get("/health", healthHandler);

// ─── API routes ───────────────────────────────────────────────────────────────

const apiRouter = Router();

// ─── Cache client (shared across IAM routes + outbox worker) ─────────────────
// Provides full CacheClient surface: basic ops + P2 set ops (sadd/srem/smembers/expire)
const iamCache = {
  get: (k: string) => redis.get(k),
  set: (k: string, v: string, _ex: "EX", ttl: number) => redis.set(k, v, "EX", ttl),
  del: (k: string | string[]) => redis.del(k as string),
  scan: (cursor: string, matchFlag: "MATCH", pattern: string, countFlag: "COUNT", count: number) =>
    (redis as unknown as {
      scan(cursor: string, ...args: unknown[]): Promise<[string, string[]]>;
    }).scan(cursor, matchFlag, pattern, countFlag, count),
  sadd: (k: string, member: string) => redis.sadd(k, member),
  srem: (k: string, member: string) => redis.srem(k, member),
  smembers: (k: string) => redis.smembers(k),
  expire: (k: string, ttl: number) => redis.expire(k, ttl),
} as Parameters<typeof registerIamRoutes>[1]["cache"];

registerIamRoutes(apiRouter, {
  db: dbAdapter.kysely,
  cache: iamCache,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
  sessionMetrics: createCacheMetrics("session"),
  bootstrapMetrics: createCacheMetrics("bootstrap"),
});

registerMetadataRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerRecordsRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerDocumentsRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  objectStorage: objectStorageAdapter
    ? {
        adapter:     objectStorageAdapter,
        bucket:      config.objectStorage!.bucket,
        maxUploadMb: config.objectStorage!.maxUploadMb,
      }
    : undefined,
  logger,
});

registerCollabRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerPlatformRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerRefRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerTaxonomyRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerClassificationRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerCommerceRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerFinanceRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerWorkflowRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerPolicyRoutes(apiRouter, {
  db: dbAdapter.kysely,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerJobsRoutes(apiRouter, {
  queues: jobsService.queues,
  auth:   { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerAuditRoutes(apiRouter, {
  db: _db,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerContentRoutes(apiRouter, {
  db: _db,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerIntegrationRoutes(apiRouter, {
  db: _db,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

registerNotificationRoutes(apiRouter, {
  db: _db,
  auth: { verifyToken: (token: string) => auth.verifyToken(token) },
  logger,
});

app.use("/api", apiRouter);

// ─── Prometheus metrics ───────────────────────────────────────────────────────
// /metrics is on the same port as the API but only reachable on the internal
// Docker network (Traefik does not route /metrics to the public edge).
// Scrape job: job_name=athyper_api in mesh/config/telemetry/metrics/config.yml
app.get("/metrics", metricsHandler);

// ─── 404 + error handlers ─────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("unhandled_error", { err: err.message, stack: err.stack });
  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: config.env !== "production" ? err.message : "Internal server error",
    ...(config.env !== "production" && { stack: err.stack }),
  });
});

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  await audit.write(
    makeAuditEvent({
      type: "server.boot.start",
      level: "info",
      actor: { kind: "system" },
      meta: { env: config.env, port: config.port, realm: config.iam.realm },
    }),
  );

  // Warm up JWKS — avoids blocking the first real request
  await auth.warmUp().catch((err) =>
    logger.warn("jwks_warmup_failed", { err: String(err) }),
  );

  // IAM outbox worker — session cache invalidation via transactional outbox
  const outboxWorker = createIamOutboxWorker({
    db: dbAdapter.kysely as unknown as import("kysely").Kysely<Record<string, any>>,
    cache: iamCache as unknown as import("@athyper/svc-iam").OutboxWorkerCache,  // iamCache is a superset
    // Realm keys used as session namespaces in the web BFF.
    // Must match resolveRealmConfig() in apps/web/lib/auth/realm-config.ts.
    sessionNamespaces: [
      config.iam.realm,                    // "athyper" (default)
      config.platformControl.realmKey,     // "platform-control"
    ],
    logger,
    pollIntervalMs: config.outbox.pollIntervalMs,
  });

  outboxWorker.start();
  outboxRunning = true;
  // Outbox stops first (LIFO), then redis, then db — registered in reverse order above
  lifecycle.onShutdown(() => {
    outboxRunning = false;
    outboxWorker.stop();
  });

  // Jobs service — BullMQ schedulers + workers
  await jobsService.start();
  jobsRunning = true;
  lifecycle.onShutdown(async () => {
    jobsRunning = false;
    await jobsService.stop();
  });

  // Signal handlers — use once() so repeated signals don't re-enter shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutdown_signal", { signal });

    await audit.write(
      makeAuditEvent({
        type: "server.shutdown",
        level: "info",
        actor: { kind: "system" },
        meta: { signal },
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
  process.once("SIGINT",  () => void shutdown("SIGINT"));

  app.listen(config.port, () => {
    logger.info("server_started", {
      port:   config.port,
      env:    config.env,
      realm:  config.iam.realm,
      issuer: config.iam.issuerUrl,
    });

    void audit.write(
      makeAuditEvent({
        type: "server.boot.success",
        level: "info",
        actor: { kind: "system" },
        meta: { port: config.port, env: config.env },
      }),
    );
  });
}

void start().catch((err: unknown) => {
  logger.fatal("boot_failed", {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
