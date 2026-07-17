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
import { trace } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";

import {
  registerIamRoutes,
  checkPermissionBatch,
  getEffectiveModuleAccess,
  createPermissionResolverRegistry,
  createPermissionContextMiddleware,
  isPlaneKey,
} from "@athyper/svc-iam";
import {
  createRuntimeBootstrapLoader,
  ExecutionDescriptorProvider,
  registerMetadataRoutes,
  RuntimeBootstrapProvider,
} from "@athyper/svc-metadata";
import { getRecordsCapabilityHandlerManifest, registerRecordsRoutes } from "@athyper/svc-records";
import { createResolverRoute, registerAllResolvers } from "@athyper/svc-shared";
import { registerSearchRoutes } from "@athyper/svc-search";
import { registerDocumentsRoutes } from "@athyper/svc-documents";
import { registerCollabRoutes } from "@athyper/svc-collab";
import { registerCollabAttachmentRoutes } from "../../packages/services/collab/routes/collab-attachments.route.js";
import { registerMasterContactsRoutes, registerMasterAddressRoutes } from "@athyper/svc-master";
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
import { mapPostgresBusinessError } from "@athyper/svc-shared";
import { registerJobsAdminRoutes } from "../../packages/services/jobs/routes/jobs.admin.route.js";
import { registerJobsBoardRoutes } from "../../packages/services/jobs/routes/jobs.board.route.js";

import {
  registerWorkflowRoutes,
  ConventionWorkflowSourceEntityAdapter,
} from "@athyper/svc-workflow";
import { runLifecycleHooks } from "@athyper/svc-business";
import { registerPolicyRoutes } from "@athyper/svc-policy";
import { registerAuditRoutes } from "@athyper/svc-audit";
import { ClamavScanner, registerContentRoutes } from "@athyper/svc-content";
import { registerIntegrationRoutes } from "@athyper/svc-integration";
import { registerDocServicesRoutes } from "@athyper/svc-doc-services";
import { createGotenbergClient } from "@athyper/server-foundation/render/gotenberg-client";
import { createOpenApiRouter } from "@athyper/server-foundation/openapi/openapi-generator";
import {
  createAiServiceBundle,
  registerAiRoutes,
} from "@athyper/svc-ai";

import {
  createAiLogMetrics,
  createCacheMetrics,
  metricsHandler,
  observeHttpRequest,
  recordAuthContextMismatch,
  recordAuthContextMismatchSuppressed,
  recordDeprecatedRouteHit,
  recordTokenClaimsInvalid,
  recordAuthTermination,
  registerJobQueues,
  registerMetricCollectors,
} from "../metrics.js";
import {
  collectFrameworkPerformanceMetrics,
  createFrameworkPerformanceMiddleware,
  startFrameworkPhase,
} from "../framework-performance.js";

/**
 * HTTP-date string for the `Sunset` response header on @deprecated routes.
 * Bump this when the removal window extends; the alias removal PR clears it.
 * Format: RFC 7231 IMF-fixdate. Read by metrics dashboards and the BFF clients
 * that surface deprecation warnings to operators.
 */
const DEPRECATED_ROUTE_SUNSET_HTTP_DATE = "Sat, 12 Sep 2026 00:00:00 GMT";
import { makeAuditEvent } from "../audit.js";
import { runComplianceSuiteIfDev } from "../../packages/services/metadata/src/entity-compliance.js";
import { createEntityCompilerService } from "../../packages/services/metadata/src/entity-compiler.service.js";
import { createCatalogCompiler } from "../../packages/services/metadata/src/catalog-compiler.js";
import { createPlatformMetricCollector } from "@athyper/server-foundation/monitoring/platform-metrics";
import {
  bindVerifiedRequestContext,
  normalizePlaneKey,
  parseOrgHeader,
  runWithContext,
  tryGetContext,
} from "../kernel/request-context.js";
import { createRequirePlatformContext } from "./require-platform-context.js";
import {
  crossCheckClaimsAgainstContext,
  enforceAuthPipeline,
  loadRequiredActionMatrix,
  type AuthPipelineMode,
  type CrossCheckReporter,
} from "../auth/auth-pipeline.js";
import { LogSampler } from "../auth/log-sampler.js";
import { parseTokenClaims } from "@athyper/runtime-contracts";
import {
  resolveRequiredActionsEnforcement,
  resolveTokenSchemaMode,
} from "@athyper/auth-common";
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

function hasHeader(req: Request, name: string): boolean {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
}

function isForwardedMetricsRequest(req: Request): boolean {
  return (
    hasHeader(req, "forwarded") ||
    hasHeader(req, "x-forwarded-host") ||
    hasHeader(req, "x-forwarded-proto")
  );
}

function appendExposeHeader(res: Response, headerName: string): void {
  const existing = res.getHeader("Access-Control-Expose-Headers");
  const values = new Set<string>();
  if (typeof existing === "string") {
    for (const part of existing.split(",")) values.add(part.trim().toLowerCase());
  } else if (Array.isArray(existing)) {
    for (const value of existing) {
      for (const part of String(value).split(",")) values.add(part.trim().toLowerCase());
    }
  }

  values.add(headerName.toLowerCase());
  res.setHeader("Access-Control-Expose-Headers", [...values].filter(Boolean).join(", "));
}

function exposeActiveTraceId(res: Response): void {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext?.traceId) return;
  res.setHeader("X-Trace-ID", spanContext.traceId);
  appendExposeHeader(res, "X-Trace-ID");
}

type ApiObjectStorage = NonNullable<ServerDeps["objectStorageRef"]["current"]>;

function createObjectStorageRouteAdapter(
  objectStorageRef: ServerDeps["objectStorageRef"],
): ApiObjectStorage {
  const current = (): ApiObjectStorage => {
    const adapter = objectStorageRef.current;
    if (!adapter) {
      throw new Error("object_storage_unavailable");
    }
    return adapter;
  };

  return {
    put: (key, body, opts) => current().put(key, body, opts),
    putStream: (key, stream, opts) => current().putStream(key, stream, opts),
    get: (key) => current().get(key),
    getStream: (key) => current().getStream(key),
    delete: (key) => current().delete(key),
    exists: (key) => current().exists(key),
    list: (prefix) => current().list(prefix),
    getPresignedUrl: (key, expirySeconds) => current().getPresignedUrl(key, expirySeconds),
    putPresignedUrl: (key, expirySeconds) => current().putPresignedUrl(key, expirySeconds),
    getMetadata: (key) => current().getMetadata(key),
    deleteMany: (keys) => current().deleteMany(keys),
    copyObject: (sourceKey, destKey) => current().copyObject(sourceKey, destKey),
    healthCheck: () => objectStorageRef.current
      ? objectStorageRef.current.healthCheck()
      : Promise.resolve({ healthy: false, message: "object_storage_unavailable" }),
    validateBucketAccess: () => current().validateBucketAccess(),
  };
}

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
    kernelConfig,
    logger,
    lifecycle,
    db,
    meshDb,
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

  // ─── Claim-first context guard mode ───────────────────────────────────────
  // Phase B (refactor): the claim-vs-context cross-checks now live in
  // server/src/auth/auth-pipeline.ts → crossCheckClaimsAgainstContext so the
  // same algorithm is exercised by verifyTokenForCurrentContext, the
  // requirePlatformContext middleware, /api/auth/verify, and the auth-bff
  // session pipeline. This wrapper only resolves the mode, builds the
  // reporter, and short-circuits on rejection.
  //   off     — no checks, no logs (default; baseline behavior preserved).
  //   shadow  — checks run, mismatches logged + counted, request proceeds.
  //   on      — checks run, mismatches throw + counted, request rejected.
  // Toggled via AUTH_CLAIM_FIRST_CONTEXT env var.
  const claimFirstModeRaw = (process.env.AUTH_CLAIM_FIRST_CONTEXT ?? "off").toLowerCase();
  const claimFirstMode: AuthPipelineMode =
    claimFirstModeRaw === "shadow" || claimFirstModeRaw === "on"
      ? (claimFirstModeRaw as AuthPipelineMode)
      : "off";
  if (claimFirstMode !== "off") {
    logger.info("auth_claim_first_context_enabled", { mode: claimFirstMode });
  }

  // Phase F — Log sampler in front of mismatch warn-logs. Counter metrics
  // stay UNSAMPLED so dashboards see the true mismatch count; only the log
  // line cardinality is throttled to keep a misconfig storm from drowning
  // structured logging. Sampling state is process-local; coordinated
  // across replicas via the Prometheus suppressed counter.
  //
  // Tuning notes (env-overridable):
  //   AUTH_MISMATCH_LOG_BURST       first N events/min log unconditionally (default 10)
  //   AUTH_MISMATCH_LOG_SAMPLE_RATE thereafter log every K-th event       (default 100)
  //   AUTH_MISMATCH_LOG_WINDOW_MS   window length                          (default 60_000)
  const burst = Number(process.env.AUTH_MISMATCH_LOG_BURST ?? 10);
  const sampleRate = Number(process.env.AUTH_MISMATCH_LOG_SAMPLE_RATE ?? 100);
  const windowMs = Number(process.env.AUTH_MISMATCH_LOG_WINDOW_MS ?? 60_000);
  const mismatchLogSampler = new LogSampler({
    burst: Number.isFinite(burst) && burst >= 0 ? Math.floor(burst) : 10,
    sampleRate: Number.isFinite(sampleRate) && sampleRate >= 1 ? Math.floor(sampleRate) : 100,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 60_000,
  });

  const pipelineReporter: CrossCheckReporter = {
    recordMismatch: (check, mode) => recordAuthContextMismatch(check, mode),
    log: (event, fields) => {
      // Bucket by (check, realm, source). Phase H/F4: realm is now included
      // so two realms under the same tenant don't merge in forensic logs.
      // issHash is the fallback when realm isn't yet known (e.g. mismatch
      // detected before realm cross-check), keyed off the validated iss.
      const check = typeof fields["check"] === "string" ? (fields["check"] as string) : "unknown";
      const realm = typeof fields["ctxRealmKey"] === "string"
        ? (fields["ctxRealmKey"] as string)
        : typeof fields["issHash"] === "string"
          ? `iss:${fields["issHash"] as string}`
          : "_";
      const tenant = typeof fields["ctxTenantId"] === "string" ? (fields["ctxTenantId"] as string) : "_";
      const plane = typeof fields["ctxPlaneKey"] === "string" ? (fields["ctxPlaneKey"] as string) : "_";
      const verdict = mismatchLogSampler.decide(`${check}|${realm}|${tenant}|${plane}`);
      if (verdict.shouldLog) {
        logger.warn(event, {
          ...fields,
          ...(verdict.suppressedRun > 0
            ? { suppressedSinceLastLog: verdict.suppressedRun }
            : {}),
          ...(verdict.windowCount > 1 ? { windowCount: verdict.windowCount } : {}),
        });
      } else {
        recordAuthContextMismatchSuppressed(
          check === "realm" || check === "plane" || check === "tenant" || check === "azp"
            ? check
            : "azp",
        );
      }
    },
  };

  const verifyTokenForCurrentContext = async (token: string): Promise<Record<string, unknown>> => {
    const ctx = tryGetContext();
    const requestedRealmKey = ctx?.realmKey ?? ctx?.realm;
    const kernelRealmKey = requestedRealmKey ?? kernelConfig?.iam.defaultRealmKey;
    const kernelRealm = kernelConfig && kernelRealmKey
      ? kernelConfig.iam.realms[kernelRealmKey]
      : undefined;

    if (kernelConfig && kernelRealmKey && !kernelRealm) {
      throw new Error(`Unknown realm: ${kernelRealmKey}`);
    }

    const rawClaims = kernelConfig && kernelRealmKey && kernelRealmKey !== kernelConfig.iam.defaultRealmKey
      ? (await (await auth.getVerifier(kernelRealmKey)).verifyJwt(token)).claims
      : await auth.verifyToken(token);

    // Phase E + Phase H/F5 — Validate claim shape at the parse boundary.
    // Mode resolved via the shared env-gate helper:
    //   local      → warn   (developer ergonomics)
    //   staging    → reject (AUTH_TOKEN_SCHEMA_MODE=warn opens a 7-day burn-in window)
    //   production → reject (always; warn is refused with a structured log)
    const claimSchemaMode = resolveTokenSchemaMode(
      config.env,
      (fields) => logger.error("auth_token_schema_mode_warn_in_prod_refused", fields),
    );
    const parsed = parseTokenClaims(rawClaims);
    let claims: Record<string, unknown> = rawClaims as Record<string, unknown>;
    if (!parsed.ok) {
      const enforcedNow = claimSchemaMode === "reject";
      recordTokenClaimsInvalid(
        parsed.error.fieldPath,
        enforcedNow ? "enforced" : "shadow",
      );
      logger.warn("token_claims_invalid", {
        requestId: ctx?.requestId,
        realmKey: kernelRealmKey,
        fieldPath: parsed.error.fieldPath,
        mode: claimSchemaMode,
        // Log issues at debug-detail; do not include them in the thrown error.
        issues: parsed.error.issues,
      });
      if (enforcedNow) throw new Error("malformed_token");
      // warn mode: continue with the raw claims (typed-loose)
    } else {
      claims = parsed.claims as unknown as Record<string, unknown>;
    }

    const allowedAzp = kernelRealm?.iam.allowedAzp ?? [];
    if (allowedAzp.length > 0) {
      const azp = claims["azp"];
      if (typeof azp !== "string" || !allowedAzp.includes(azp)) {
        throw new Error(`Token azp is not allowed for realm "${kernelRealmKey}"`);
      }
    }

    // Pipeline step 1 — claim-first cross-checks. Throws on enforced mismatch
    // so the existing routeAuth callers' try/catch maps to 401/403 as before.
    const crossCheck = crossCheckClaimsAgainstContext(
      { claims, ctx, allowedAzp },
      claimFirstMode,
      pipelineReporter,
    );
    if (!crossCheck.ok) {
      const first = crossCheck.mismatches[0];
      throw new Error(`auth_context_mismatch:${first?.check ?? "unknown"}`);
    }

    return claims;
  };

  const routeAuth = { verifyToken: verifyTokenForCurrentContext };
  const objectStorage = config.objectStorage
    ? createObjectStorageRouteAdapter(objectStorageRef)
    : undefined;

  // Register BullMQ queues for /metrics queue depth gauges.
  // Cast to Record<string, unknown> — DepthQueue duck-type is satisfied by BullMQ Queue.
  registerJobQueues(jobs.queues as unknown as Parameters<typeof registerJobQueues>[0]);
  registerMetricCollectors([
    { name: "platform", collect: createPlatformMetricCollector(_db) },
    { name: "framework_performance", collect: async () => collectFrameworkPerformanceMetrics() },
  ]);

  // ─── IAM cache client ──────────────────────────────────────────────────────
  // Provides the full CacheClient surface used by IAM and platform routes:
  // basic ops + P2 set ops (sadd/srem/smembers/expire) for session tracking.
  const iamCache = {
    get: (k: string) => redis.get(k),
    set: (k: string, v: string, _ex: "EX", ttl: number) =>
      redis.set(k, v, "EX", ttl),
    del: (k: string | string[]) =>
      Array.isArray(k) ? (k.length > 0 ? redis.del(...k) : Promise.resolve(0)) : redis.del(k),
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
    eval: (script: string, numKeys: number, ...args: Array<string | number>) =>
      redis.eval(script, numKeys, ...args),
    incr: (k: string) => redis.incr(k),
  } as Parameters<typeof registerIamRoutes>[1]["cache"];

  const descriptorCache = {
    get: (k: string) => redis.get(k),
    mget: (...keys: string[]) => redis.mget(...keys),
    set: async (k: string, v: string, ttl: number): Promise<void> => {
      await redis.set(k, v, "EX", ttl);
    },
    del: async (k: string): Promise<void> => {
      await redis.del(k);
    },
    incr: (k: string) => redis.incr(k),
  };
  const executionDescriptorProvider = new ExecutionDescriptorProvider({
    redis: descriptorCache,
    generationCacheTtlMs: 1_000,
    loadFromL3: ({ entityCode, tenantId }) => deps.entityCompiler.loadExecutionDescriptor(entityCode, tenantId),
    logger,
  });
  // Keep each API replica's bounded generation cache exact without polling
  // Redis on every L1 descriptor hit. The invalidation publisher increments
  // the generation vector and emits this message after the increments commit.
  const descriptorInvalidationSubscriber = redis.duplicate();
  descriptorInvalidationSubscriber.on("message", (_channel, raw) => {
    try {
      const payload = JSON.parse(raw) as { plane?: string; tenant?: string; entity?: string };
      executionDescriptorProvider.applyInvalidation({
        ...(payload.plane === "neon" || payload.plane === "mesh" || payload.plane === "admin" ? { plane: payload.plane } : {}),
        ...(payload.tenant ? { tenantId: payload.tenant } : {}),
        ...(payload.entity ? { entityCode: payload.entity } : {}),
      });
    } catch (error) {
      logger.warn("execution_descriptor_invalidation_message_invalid", { err: String(error) });
    }
  });
  void descriptorInvalidationSubscriber.subscribe("execdesc:invalidate:v1").catch((error) => {
    logger.warn("execution_descriptor_invalidation_subscribe_failed", { err: String(error) });
  });
  lifecycle.onShutdown(() => descriptorInvalidationSubscriber.disconnect());
  const runtimeBootstrapProvider = new RuntimeBootstrapProvider({
    redis: descriptorCache,
    load: createRuntimeBootstrapLoader({
      db: db.kysely as never,
      loadCompiledEntity: async (entityCode, tenantId) =>
        deps.entityCompiler.loadRuntimeCompiledEntity(entityCode, tenantId) as unknown as Promise<Record<string, unknown> | null>,
    }),
  });

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
      (req.headers["x-request-id"] as string) ?? randomUUID();
    req.headers["x-request-id"] = requestId;
    const planeKey = normalizePlaneKey(
      req.headers["x-plane-key"] ?? req.headers["x-plane"] ?? req.query.plane,
    );
    const realmKey =
      (req.headers["x-realm-key"] as string | undefined) ??
      (req.headers["x-realm"] as string | undefined);

    const xOrg =
      (req.headers["x-org"] as string | undefined) ??
      (req.headers["x-tenant-code"] as string | undefined);
    runWithContext({
      requestId,
      ...(planeKey ? { planeKey } : {}),
      ...(realmKey ? { realmKey, realm: realmKey } : {}),
      ...parseOrgHeader(xOrg),
    }, next);
  });

  // P0 meta-entity performance baseline. This sits inside the canonical
  // request ALS so DB and Redis adapter callbacks contribute to the same
  // request-local snapshot. Unrelated routes pass through without allocation.
  app.use(createFrameworkPerformanceMiddleware());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const tenantId = tryGetContext()?.tenantId ?? "unknown";
      observeHttpRequest({
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        tenantId,
      });
    });
    next();
  });

  app.use((_req: Request, res: Response, next: NextFunction) => {
    exposeActiveTraceId(res);
    next();
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

  // Bearer-token verifier for gateway / service integrations and Traefik
  // forward-auth. Browser workbench routers do NOT consume this — the BFF
  // session layer enforces auth via cookie.
  //
  // Phase B refactor: every check (claim cross-checks, tenant resolution,
  // optional required-actions) goes through the shared auth-pipeline so the
  // behaviour stays identical across this endpoint, the platform middleware,
  // and verifyTokenForCurrentContext. Pipeline errors carry the canonical
  // HTTP status + code; this handler only adapts them to the gateway
  // response shape (headers + scoped role headers on success).
  //
  // Env flags consumed:
  //   AUTH_VERIFY_REQUIRE_PLANE             — when "on", reject calls missing x-plane (400)
  //   AUTH_REQUIRED_ACTIONS_ENFORCE         — shared with the platform gate. Default
  //                                           per env (local off, staging/prod on);
  //                                           explicit `off` outside local logs a
  //                                           visible deprecation event.
  const verifyRequirePlane =
    (process.env.AUTH_VERIFY_REQUIRE_PLANE ?? "off").toLowerCase() === "on";
  const verifyEnforceRequiredActions = resolveRequiredActionsEnforcement(
    config.env,
    (fields) => logger.warn(String(fields["event"] ?? "auth_required_actions_compat_mode_engaged"), fields),
  );
  logger.info("auth_verify_required_actions_resolved", {
    env: config.env,
    enforced: verifyEnforceRequiredActions,
  });
  app.get("/api/auth/verify", (req: Request, res: Response): void => {
    void (async () => {
      const authHeader = req.headers["authorization"] ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) {
        res.status(401).end();
        return;
      }

      const xPlane = normalizePlaneKey(req.headers["x-plane-key"] ?? req.headers["x-plane"]);
      if (verifyRequirePlane && !xPlane) {
        res.status(400).json({
          error: "MISSING_PLANE",
          message: "x-plane header is required for /api/auth/verify.",
        });
        return;
      }
      if (!xPlane) {
        logger.warn("auth_verify_missing_plane_legacy", {
          message: "x-plane absent; legacy caller — flip AUTH_VERIFY_REQUIRE_PLANE=on to enforce.",
        });
      }

      let claims: Record<string, unknown>;
      try {
        claims = await verifyTokenForCurrentContext(match[1]!);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Token verification failed.";
        const isContextMismatch = message.startsWith("auth_context_mismatch:");
        res.status(isContextMismatch ? 403 : 401).end();
        return;
      }

      // Synthesize a PipelineCtx from the request headers — /api/auth/verify is
      // mounted on `app`, so the apiRouter tenant-stamp middleware doesn't run
      // here and the ALS ctx will not carry tenantId/planeKey. The pipeline
      // resolves them via headers + claims directly.
      const xOrg =
        (req.headers["x-org"] as string | undefined) ??
        (req.headers["x-tenant-code"] as string | undefined) ??
        "";
      const xRealm =
        (req.headers["x-realm-key"] as string | undefined)
        ?? (req.headers["x-realm"] as string | undefined);

      const result = await enforceAuthPipeline(
        {
          claims,
          ctx: {
            ...(xPlane ? { planeKey: xPlane } : {}),
            ...(xRealm ? { realmKey: xRealm } : {}),
          },
          headers: {
            ...(xOrg ? { xOrg } : {}),
            ...(xRealm ? { xRealm } : {}),
          },
          // No downstream route info — required-actions enforcement, if
          // enabled, blocks on ANY pending action (most conservative).
        },
        {
          mode: claimFirstMode,
          resolveTenant: true,
          // Gateway integrations rely on this endpoint with service tokens
          // that lack AUTHORIZED — leave the role gate to the gateway. The
          // platform-context middleware enforces AUTHORIZED on the tenant API.
          enforceAuthorized: false,
          enforceRequiredActions: verifyEnforceRequiredActions,
        },
        {
          db: _db,
          defaultRealmKey: effectiveDefaultRealm,
          logger,
          reporter: pipelineReporter,
        },
      );

      if (!result.ok && result.error) {
        logger.warn("auth_verify_pipeline_blocked", {
          code: result.error.code,
          ...(result.error.check ? { check: result.error.check } : {}),
          ...(result.error.blockingAction ? { blockingAction: result.error.blockingAction } : {}),
          ...result.error.detail,
        });
        // Auth context / tenant errors keep their canonical statuses; the
        // gateway-facing endpoint historically returned empty bodies for
        // 401/403 but now returns a structured body so callers can decide
        // whether to retry with different headers.
        res.status(result.error.status).json({
          error: result.error.code,
          message: result.error.message,
          ...(result.error.blockingAction
            ? { requiredAction: result.error.blockingAction }
            : {}),
        });
        return;
      }

      // Success — emit scoped role headers for the forward-auth consumer.
      const sub = typeof claims["sub"] === "string" ? claims["sub"] : "";
      const tenantIdHeader = typeof claims["tenant_id"] === "string"
        ? (claims["tenant_id"] as string)
        : (result.canonical?.tenantId ?? "");
      const realmAccess = claims["realm_access"] as Record<string, unknown> | undefined;
      const realmRoles = Array.isArray(realmAccess?.["roles"])
        ? (realmAccess!["roles"] as unknown[]).filter((r): r is string => typeof r === "string")
        : [];
      const resolvedPlane = result.canonical?.planeKey ?? xPlane ?? null;
      const planeClientId = resolvedPlane ? `${resolvedPlane}-web` : null;
      const resourceAccess = claims["resource_access"] as Record<string, Record<string, unknown>> | undefined;
      const planeClientRoles = planeClientId && resourceAccess?.[planeClientId]
        ? (Array.isArray(resourceAccess[planeClientId]?.["roles"])
            ? (resourceAccess[planeClientId]!["roles"] as unknown[]).filter(
                (r): r is string => typeof r === "string",
              )
            : [])
        : [];

      res.setHeader("X-User-Id", sub);
      res.setHeader("X-Tenant-Id", tenantIdHeader);
      if (resolvedPlane) res.setHeader("X-Verify-Plane", resolvedPlane);
      res.setHeader("X-Realm-Roles", realmRoles.join(","));
      if (planeClientId) {
        res.setHeader(`X-Client-Roles-${planeClientId}`, planeClientRoles.join(","));
      }
      // Deprecated legacy header — scoped to realm + plane-client only.
      res.setHeader("X-User-Roles", [...new Set([...realmRoles, ...planeClientRoles])].join(","));
      res.status(200).end();
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
  //
  // F1 hardening:
  //   - Defaults the realm to kernelConfig.iam.defaultRealmKey instead of the
  //     hardcoded "athyper" string so multi-realm deployments don't silently
  //     bind to the wrong tenant universe.
  //   - Replaces the previous `catch {}` swallow with a structured log so a
  //     DB error during tenant resolution is observable rather than mute.
  //   - The actual claim-vs-context cross-check happens inside
  //     verifyTokenForCurrentContext once the token is verified.
  const effectiveDefaultRealm = kernelConfig?.iam.defaultRealmKey ?? config.iam.realm;
  apiRouter.use(async (req: Request, _res: Response, next: NextFunction) => {
    const endRequestContext = startFrameworkPhase("request_context");
    const xOrg =
      (req.headers["x-org"] as string | undefined) ??
      (req.headers["x-tenant-code"] as string | undefined) ??
      "";
    // A few legacy handlers still read req.headers["x-org"] directly. Keep
    // that internal compatibility surface aligned with the canonical tenant
    // header while all authorization checks continue to validate the value.
    if (xOrg && !req.headers["x-org"]) req.headers["x-org"] = xOrg;
    const xRealm =
      (req.headers["x-realm-key"] as string | undefined) ??
      (req.headers["x-realm"] as string | undefined) ??
      effectiveDefaultRealm;
    const ctx = tryGetContext();
    if (ctx) {
      const planeKey = normalizePlaneKey(
        req.headers["x-plane-key"] ?? req.headers["x-plane"] ?? req.query.plane,
      );
      if (planeKey) ctx.planeKey = planeKey;
      ctx.realmKey = xRealm;
      ctx.realm = xRealm;
      Object.assign(ctx, parseOrgHeader(xOrg));
    }
    if (xOrg) {
      const tenantCode = xOrg.split("--")[0];
      if (tenantCode) {
        try {
          const row = await _db
            .selectFrom("master.tenant as t")
            .select("t.id")
            .where("t.code",      "=", tenantCode)
            .where("t.realm_key", "=", xRealm)
            .executeTakeFirst();
          if (row) {
            if (ctx) ctx.tenantId = row.id as string;
          } else {
            logger.warn("tenant_resolution_not_found", {
              requestId: ctx?.requestId,
              tenantCode,
              realmKey: xRealm,
              orgKey: ctx?.orgKey,
            });
          }
        } catch (err) {
          // Surface DB errors as structured logs instead of swallowing — the
          // downstream route still handles missing tenant via 401/404, but
          // ops needs to see DB-layer failures during tenant resolution.
          logger.error("tenant_resolution_failed", {
            requestId: ctx?.requestId,
            tenantCode,
            realmKey: xRealm,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    endRequestContext();
    next();
  });

  // ── Unified platform-context gate (Phase 1 proper + Phase 7) ──────────────
  // Off by default; flip to "on" once the shadow-mode metrics from
  // AUTH_CLAIM_FIRST_CONTEXT have been clean for one rollout window. The gate:
  //   - rejects missing/invalid bearer (401)
  //   - rejects claim-vs-context mismatches surfaced by verifyTokenForCurrentContext
  //     under AUTH_CLAIM_FIRST_CONTEXT=on (403)
  //   - re-asserts AUTHORIZED on `${plane}-web` (403)
  //   - applies the required_actions blocking matrix (403)
  //   - caches verified claims on req.athyperClaims so downstream handlers can
  //     skip a second verifyToken call
  //
  // Routes that legitimately accept anonymous traffic must match a prefix in
  // DEFAULT_PUBLIC_ROUTES inside require-platform-context.ts.
  if ((process.env.AUTH_PLATFORM_CONTEXT_GATE ?? "off").toLowerCase() === "on") {
    logger.info("auth_platform_context_gate_enabled");
    apiRouter.use((_req: Request, res: Response, next: NextFunction) => {
      (res.locals as Record<string, unknown>)["authenticationStartedAt"] = process.hrtime.bigint();
      (res.locals as Record<string, unknown>)["authenticationPhaseEnd"] = startFrameworkPhase("authentication");
      next();
    });
    apiRouter.use(createRequirePlatformContext({
      verifyToken: verifyTokenForCurrentContext,
      logger,
      db: _db,
      defaultRealmKey: effectiveDefaultRealm,
      reporter: pipelineReporter,
      env: config.env,
    }));
    apiRouter.use((_req: Request, res: Response, next: NextFunction) => {
      const startedAt = (res.locals as Record<string, unknown>)["authenticationStartedAt"];
      if (typeof startedAt === "bigint") {
        (res.locals as Record<string, unknown>)["authenticationMs"] =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      }
      const endAuthentication = (res.locals as Record<string, unknown>)["authenticationPhaseEnd"];
      if (typeof endAuthentication === "function") (endAuthentication as () => void)();
      next();
    });
  }

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

  // ─── Permission-context middleware (Phase 5) ────────────────────────────────
  // Build the EffectivePermissionContext for each authenticated request and
  // stash it on res.locals so downstream routes (entity-operations, runtime-
  // records, etc.) can read the resolved {allowed, denied} sets without
  // re-running the persona / grant SQL. Falls back gracefully when:
  //   - no Bearer token  → readContextInput returns null
  //   - no tenant scope  → readContextInput returns null
  //   - resolver throws  → middleware catches and converts mesh "no binding"
  //                        errors to 403; other errors propagate to the
  //                        existing express error handler.
  // The legacy route paths that call checkPermissionBatch inline keep
  // working — the middleware is additive; consumers opt in by reading
  // res.locals.effectivePermissionContext.
  // The resolver registry only consumes the kysely client as an opaque
  // executor — the concrete DB schema is irrelevant. `as never` strips the
  // generated DB$1 typing without compromising the SQL the resolvers run
  // (they all use the kysely sql tag which doesn't typecheck the schema).
  const permissionResolverRegistry = createPermissionResolverRegistry({
    neon:  { db: db.kysely as unknown as never },
    admin: { db: db.kysely as unknown as never },
    mesh:  { db: db.kysely as unknown as never, meshDb: meshDb?.kysely as unknown as never },
  });
  apiRouter.use(createPermissionContextMiddleware({
    registry: permissionResolverRegistry,
    onError: (err) => logger.warn("permission_context_middleware_failed", { err: String(err) }),
    onResolved: (permissions) => {
      const context = tryGetContext();
      if (!context) return;
      context.tenantId = permissions.tenantId;
      context.principalId = permissions.principalId;
      context.profileHash = permissions.profileHash;
      context.personaId = permissions.personaId;
      context.accountGrantId = permissions.accountGrantId;
      context.principalFingerprint = permissions.principalFingerprint;
    },
    readContextInput: (req): { planeKey: "neon" | "admin" | "mesh"; tenantId: string; principalId: string } | null => {
      const planeRaw = req.headers["x-plane-key"] ?? req.headers["x-plane"];
      const plane    = Array.isArray(planeRaw) ? planeRaw[0] : planeRaw;
      if (!isPlaneKey(plane)) return null;

      // The tenant-stamp middleware (above) populated AsyncLocalStorage; pull
      // the resolved tenantId without re-doing the master.tenant lookup.
      // tryGetContext is the safe variant (returns undefined off-request).
      const ctx = tryGetContext();
      const tenantId = ctx?.tenantId;
      const principalId = ctx?.principalId;
      if (!tenantId || !principalId) return null;

      return { planeKey: plane, tenantId, principalId };
    },
  }));

  registerIamRoutes(apiRouter, {
    db: db.kysely,
    meshDb: meshDb?.kysely,
    cache: iamCache,
    auth: routeAuth,
    logger,
    sessionMetrics: createCacheMetrics("session"),
    bootstrapMetrics: createCacheMetrics("bootstrap"),
    terminationMetrics: recordAuthTermination,
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
    meshDb: meshDb?.kysely,
    auth: routeAuth,
    logger,
    cache: descriptorCache,
    executionDescriptorProvider,
    loadEffectiveCompiledEntity: async (entityCode, tenantId) =>
      deps.entityCompiler.loadRuntimeCompiledEntity(entityCode, tenantId) as unknown as Promise<Record<string, unknown> | null>,
    readAuthenticatedContext: () => {
      const context = tryGetContext();
      return context ? { tenantId: context.tenantId } : undefined;
    },
    runtimeBootstrapProvider,
    checkPermissionBatch,
    getEffectiveModuleAccess,
    validateEntityVersionActivation: (versionId) => deps.entityCompiler.validateVersionForActivation(versionId),
  });

  registerRecordsRoutes(apiRouter, {
    db:                   db.kysely,
    auth:                 routeAuth,
    logger,
    cache:                iamCache,
    objectStorage,
    importQueue:          jobs.queues.import,
    importMaxUploadMb:    config.objectStorage?.maxUploadMb,
    checkPermissionBatch,
    permissionResolverRegistry,
    executionDescriptorProvider,
    entityQueryCursorSecret: process.env["ENTITY_QUERY_CURSOR_SECRET"] ?? process.env["EXPORT_TOKEN_SECRET"],
    tokenSecret:          process.env["EXPORT_TOKEN_SECRET"],
    redis,
    readAuthenticatedContext: () => {
      const context = tryGetContext();
      return context ? { tenantId: context.tenantId } : undefined;
    },
    onVerifiedContext: bindVerifiedRequestContext,
  });

  // Cascade rederive resolvers — POST /api/resolvers/:code
  registerAllResolvers();
  createResolverRoute(apiRouter, {
    db:   db.kysely,
    auth: routeAuth,
    logger,
  });

  registerMasterContactsRoutes(apiRouter, {
    db:     db.kysely,
    auth:   routeAuth,
    logger,
  });

  registerMasterAddressRoutes(apiRouter, {
    db:     db.kysely,
    auth:   routeAuth,
    logger,
  });

  // Track B2 — cross-entity search. `search` is null when Meilisearch is
  // not configured; the route returns 503 in that case.
  registerSearchRoutes(apiRouter, {
    db:     db.kysely,
    auth:   routeAuth,
    search: deps.searchService,
    logger,
  });

  registerDocumentsRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    objectStorage: objectStorage
      ? {
          adapter: objectStorage,
          bucket: config.objectStorage!.bucket,
          maxUploadMb: config.objectStorage!.maxUploadMb,
        }
      : undefined,
    tikaQueue: jobs.tikaExtractEnabled ? jobs.queues.tikaExtract : undefined,
    logger,
  });

  registerCollabRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    mentionService,
    redis,
    logger,
  });

  registerCollabAttachmentRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    objectStorage: config.objectStorage
      ? { adapterRef: objectStorageRef, bucket: config.objectStorage.bucket, maxUploadMb: config.objectStorage.maxUploadMb }
      : undefined,
    logger,
  });

  registerPlatformRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    cache: iamCache,
    logger,
    deprecation: {
      recordHit: recordDeprecatedRouteHit,
      sunsetHttpDate: DEPRECATED_ROUTE_SUNSET_HTTP_DATE,
    },
  });

  registerRefRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    logger,
  });

  registerTaxonomyRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    logger,
  });

  registerClassificationRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    logger,
  });

  registerCommerceRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    logger,
  });

  registerFinanceRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    cache: iamCache,
    checkPermissionBatch,
    logger,
  });

  registerWorkflowRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    logger,
    sourceEntityAdapter: new ConventionWorkflowSourceEntityAdapter(logger, {
      beforeComplete: async (trx, completion, targetStatus) => {
        if (completion.entityType.replace(/^document\./, "") !== "purchase_order") return;
        const transition = await trx
          .selectFrom("control.lifecycle_transition as lt")
          .innerJoin("control.lifecycle as lc", "lc.id", "lt.lifecycle_id")
          .innerJoin("control.lifecycle_state as fs", "fs.id", "lt.from_state_id")
          .innerJoin("control.lifecycle_state as ts", "ts.id", "lt.to_state_id")
          .select(["lt.id as transition_id", "lt.operation_code"])
          .where("lc.code", "=", "commitment")
          .where("fs.code", "=", "pending_approval")
          .where("ts.code", "=", targetStatus)
          .where("lt.is_active", "=", true)
          .where("lt.tenant_id", "is", null)
          .executeTakeFirst() as { transition_id: string; operation_code: string } | undefined;
        if (!transition) throw Object.assign(new Error(`PO_WORKFLOW_TRANSITION_NOT_FOUND: pending_approval -> ${targetStatus}`), { code: 422 });
        await runLifecycleHooks(trx as never, {
          tenantId: completion.tenantId,
          transitionId: transition.transition_id,
          sourceDocType: "purchase_order",
          sourceDocId: completion.entityId,
          principalId: completion.actorId,
          timing: "before",
          fromStatus: "pending_approval",
          toStatus: targetStatus,
          operationCode: transition.operation_code,
        });
      },
      afterComplete: async (trx, completion, targetStatus) => {
        if (completion.entityType.replace(/^document\./, "") !== "purchase_order") return;
        const transition = await trx
          .selectFrom("control.lifecycle_transition as lt")
          .innerJoin("control.lifecycle as lc", "lc.id", "lt.lifecycle_id")
          .innerJoin("control.lifecycle_state as fs", "fs.id", "lt.from_state_id")
          .innerJoin("control.lifecycle_state as ts", "ts.id", "lt.to_state_id")
          .select(["lt.id as transition_id", "lt.operation_code"])
          .where("lc.code", "=", "commitment")
          .where("fs.code", "=", "pending_approval")
          .where("ts.code", "=", targetStatus)
          .where("lt.is_active", "=", true)
          .where("lt.tenant_id", "is", null)
          .executeTakeFirst() as { transition_id: string; operation_code: string } | undefined;
        if (!transition) return;
        await runLifecycleHooks(trx as never, {
          tenantId: completion.tenantId,
          transitionId: transition.transition_id,
          sourceDocType: "purchase_order",
          sourceDocId: completion.entityId,
          principalId: completion.actorId,
          timing: "after",
          fromStatus: "pending_approval",
          toStatus: targetStatus,
          operationCode: transition.operation_code,
        });
      },
    }),
  });

  registerPolicyRoutes(apiRouter, {
    db: db.kysely,
    auth: routeAuth,
    logger,
  });

  registerJobsRoutes(apiRouter, {
    queues: jobs.queues,
    auth: routeAuth,
    logger,
  });

  registerJobsAdminRoutes(apiRouter, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queues: jobs.queues as any,
    db:     _db,
    auth: routeAuth,
    logger,
  });

  // Embedded BullBoard UI at /api/jobs/admin/board — gated by
  // JOBS.BOARD.VIEW (read) and JOBS.QUEUE.MANAGE (mutate). The standalone
  // `deadly0/bull-board:3` container is retained as an internal-only
  // break-glass fallback under compose profile `emergency`.
  registerJobsBoardRoutes(apiRouter, {
    queues: jobs.queues,
    db:     _db,
    auth: routeAuth,
    logger,
  });

  registerAuditRoutes(apiRouter, {
    db: _db,
    auth: routeAuth,
    storage: objectStorage ?? null,
    cache: iamCache,
    logger,
  });

  registerContentRoutes(apiRouter, {
    db: _db,
    auth: routeAuth,
    objectStorage: objectStorage
      ? {
          adapter:     objectStorage,
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
    auth: routeAuth,
    cache: iamCache,
    logger,
    credentialEncryption: credentialEncryption ?? undefined,
  });

  registerNotificationRoutes(apiRouter, {
    db: _db,
    auth: routeAuth,
    logger,
    notificationQueue: jobs.queues.notifications as never,
    bounceWebhookSecret: deps.config.email?.bounce_webhook_secret,
    webPush: {
      configured: Boolean(config.push?.vapidSubject && config.push.vapidPublicKey && config.push.vapidPrivateKey),
      publicKey:  config.push?.vapidPublicKey,
    },
  });

  const _gotenberg = createGotenbergClient({ logger });
  registerDocServicesRoutes(apiRouter, {
    db: _db,
    auth: routeAuth,
    logger,
    renderer: _gotenberg ?? undefined,
  });

  // ─── AI Foundation routes ──────────────────────────────────────────────────
  // Phase 7a: POST /ai/actions/run | /preview, POST /ai/feedback,
  //           GET /ai/policy/effective
  // ANTHROPIC_API_KEY must be set in env to enable real model calls.
  const aiCache = {
    get: (k: string) => redis.get(k),
    set: (k: string, v: string, _ex: "EX", ttl: number) => redis.set(k, v, "EX", ttl),
    del: (k: string | string[]) =>
      Array.isArray(k) ? (k.length > 0 ? redis.del(...k) : Promise.resolve(0)) : redis.del(k),
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
  };
  const aiBundle = await createAiServiceBundle({
    db: _db,
    redis: aiCache,
    logger,
    metrics: createAiLogMetrics(),
  });
  registerAiRoutes(apiRouter, {
    db:    _db,
    auth:  routeAuth as { verifyToken(token: string): Promise<{ sub: string; [k: string]: unknown }> },
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
    requireAuth: config.env === "production",
    serveDocs:   config.env !== "production",
    authVerify:  verifyTokenForCurrentContext,
  }));

  // ─── Prometheus metrics ────────────────────────────────────────────────────
  // /metrics is on the same port as the API. Prometheus scrapes it over the
  // internal Docker network; reverse-proxied requests are hidden as 404.
  app.get("/metrics", (req: Request, res: Response) => {
    if (isForwardedMetricsRequest(req)) {
      res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
      return;
    }
    metricsHandler(req, res);
  });

  // ─── 404 + error handlers ──────────────────────────────────────────────────

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const businessError = mapPostgresBusinessError(err);
    if (businessError) {
      logger.warn("handled_business_error", {
        err: businessError.code,
        message: businessError.message,
        details: businessError.details,
      });
      res.status(businessError.status).json({
        error: businessError.code,
        message: businessError.message,
        field: businessError.field,
        details: businessError.details,
        errors: [{
          code: businessError.code,
          message: businessError.message,
          field: businessError.field,
          details: businessError.details,
        }],
      });
      return;
    }

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
    const startedAt = Date.now();
    logger.info("entity_compile_pipeline_started", {
      mode: "catalog_then_execution",
      environment: config.env,
    });
    try {
      logger.info("entity_catalog_compile_started");
      const catalogSummary = await createCatalogCompiler(_db, logger).compileAll();
      logger.info("entity_catalog_compile_finished", {
        total: catalogSummary.total,
        compiled: catalogSummary.compiled,
        persisted: catalogSummary.persisted,
        failed: catalogSummary.failed,
        diagnostics: catalogSummary.diagnostics.length,
        durationMs: Date.now() - startedAt,
      });

      logger.info("entity_execution_compile_started");
      const compiler = createEntityCompilerService(_db, logger, getRecordsCapabilityHandlerManifest());
      const compileSummary = await compiler.compileAllSystemEntities();
      logger.info("entity_execution_compile_finished", {
        total: compileSummary.total,
        compiled: compileSummary.compiled,
        failed: compileSummary.failed,
        eligible: compileSummary.eligibleEntityCodes.length,
        persisted: compileSummary.persistedEntityCodes.length,
        snapshotPersistenceFailed: compileSummary.snapshotPersistenceFailedEntityCodes.length,
        graphPassed: compileSummary.graphValidation.passed,
        diagnostics: compileSummary.graphValidation.diagnostics.length,
        durationMs: Date.now() - startedAt,
      });

      logger.info("entity_compliance_started");
      await runComplianceSuiteIfDev(_db, logger, compileSummary);
      logger.info("entity_compile_pipeline_finished", {
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      logger.error("entity_compile_pipeline_failed", {
        durationMs: Date.now() - startedAt,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
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
