// server/src/kernel/bootstrap.ts
//
// Server bootstrap: constructs all infrastructure adapters, installs process
// error handlers, wires LIFO lifecycle shutdown, and returns a ServerDeps bag
// consumed by each runtime entry point.
//
// Consumed by:
//   server/src/runtimes/api.ts       — HTTP API runtime (Phase 1)
//   server/src/runtimes/worker.ts    — BullMQ worker runtime (Phase 2A)
//   server/src/runtimes/scheduler.ts — scheduler runtime (Phase 2A)
//
// Invariants:
//   - No Express, no HTTP, no route registration in this file.
//   - No side effects at module evaluation time (safe to import in tests).
//   - All returned adapters are ready to use synchronously.
//   - Object storage adapter may asynchronously null itself if bucket validation
//     fails — callers read objectStorageRef.current, never the raw adapter.

import { createDbAdapter } from "@athyper/adapter-db";

// Phase D — the realm-default setter is exposed only through the bootstrap
// subpath. Route packages resolve `@athyper/svc-shared` and never see it, so
// route handlers cannot retarget the realm at runtime.
import { setDefaultRealmKey } from "@athyper/svc-shared/bootstrap";

import { recordAuthFlagPostureWarning, recordTenantStampSkipped } from "../metrics.js";
import { applyAuthFlagPostureValidation } from "./auth-flag-validator.js";
import { tryGetContext } from "./request-context.js";
import { createRedisClient, type RedisClientOptions } from "@athyper/adapter-memorycache";
import { createAuthAdapter } from "@athyper/adapter-auth";
import {
  createS3ObjectStorageAdapter,
  type ObjectStorageAdapter,
} from "@athyper/adapter-objectstorage";
import {
  createJobsService,
  createWfOutboxHandler,
  type NotificationChannelHandler,
  type BackupObjectStorage,
} from "@athyper/svc-jobs";

import {
  CircuitBreaker,
  DB_RETRY_POLICY,
  REDIS_RETRY_POLICY,
} from "@athyper/server-foundation/resilience";
import { pingSuccess, pingFail } from "@athyper/server-foundation/monitoring/healthchecks";
import { Sentry } from "@athyper/server-foundation/monitoring/sentry";
import { createCredentialEncryptionService } from "@athyper/server-foundation/crypto/credential-encryption.service";
import { ServiceRegistry, type HealthCheck, type HealthContribution } from "@athyper/server-foundation/registry/service-registry";
import { createFeatureFlagService } from "../../packages/services/platform/feature-flag.service.js";
import { createMetadataApprovalBridge } from "../../packages/services/metadata/src/metadata-approval-bridge.js";
import { createEntityCompilerService } from "../../packages/services/metadata/src/entity-compiler.service.js";
import { invalidateDescriptorCache } from "../../packages/services/metadata/index.js";
import { WorkflowEngine, ApproverResolverService } from "@athyper/svc-workflow";
import { createPdfRendererClient } from "@athyper/server-foundation/render/pdf-renderer-client";
import { createGotenbergClient } from "@athyper/server-foundation/render/gotenberg-client";
import {
  createMeilisearchClient,
  createSearchService,
  createSearchOutboxHandler,
  invoiceOverride,
  journalEntryOverride,
  INVOICE_ENTITY_TYPE,
  JOURNAL_ENTRY_ENTITY_TYPE,
  type EntityDocumentOverride,
  type SearchService,
} from "@athyper/svc-search";
import { createRenderService } from "@athyper/server-foundation/render/render.service";
import { createHttpConnectorClient, createOAuth2TokenCache } from "@athyper/svc-integration";
import { createPersonaRegistryService } from "../../packages/services/iam/persona-registry.service.js";
import { createCompanyCodeScopeService } from "../../packages/services/iam/permission/company-code-scope.service.js";
import { createMentionService } from "../../packages/services/collab/mention.service.js";
import { createNotificationOrchestrator } from "../../packages/services/platform/notification-orchestrator.js";

import { createEmailAdapter } from "../../packages/services/jobs/adapters/email.adapter.js";
import { createWebhookAdapter } from "../../packages/services/jobs/adapters/webhook.adapter.js";
import { createSmsAdapter } from "../../packages/services/jobs/adapters/sms.adapter.js";
import { createPushAdapter } from "../../packages/services/jobs/adapters/push.adapter.js";
import {
  createWebhookDeliveryWorker,
  type WebhookDeliveryWorkerResult,
} from "../../packages/services/jobs/workers/webhook-delivery.worker.js";

import type { ServerConfig } from "../config.js";
import type { ResolvedKernelConfig } from "../kernel-config.js";
import { getDefaultRealm, buildAdditionalRealms } from "../kernel-config.js";
import { createLogger } from "../logger.js";
import { Lifecycle } from "../lifecycle.js";
import {
  createConsoleAuditWriter,
  createDbAuditWriter,
  type AuditWriter,
} from "../audit.js";

// ─── Public type ──────────────────────────────────────────────────────────────
//
// ServerDeps is the canonical shape passed between bootstrap and runtimes.
// Inferred from the return of bootstrap() so it always stays in sync.

export type ServerDeps = Awaited<ReturnType<typeof bootstrap>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "6379", 10),
    // Redis 6+ ACL: include username so ioredis sends AUTH <user> <pass>.
    // Empty string means "default user" — omit so we don't override the default.
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: parseInt(u.pathname.replace(/^\//, "") || "0", 10),
    // TCP keepalive: send probe after 60 s idle — prevents Docker NAT from
    // silently dropping connections at the ~300 s conntrack timeout.
    keepAlive: 60_000,
  };
}

function createObjectStorageRefAdapter(
  objectStorageRef: { current: ObjectStorageAdapter | null },
): ObjectStorageAdapter {
  const current = (): ObjectStorageAdapter => {
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

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function checkTikaEndpoint(tikaUrl: string): Promise<HealthContribution> {
  const url = `${tikaUrl.replace(/\/+$/, "")}/`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2_000);
  const t = Date.now();

  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    return {
      status:    res.ok ? "healthy" : "degraded",
      message:   res.ok ? undefined : `tika_http_${res.status}`,
      latencyMs: Date.now() - t,
    };
  } catch (err) {
    return {
      status:    "degraded",
      message:   err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - t,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Construct all infrastructure adapters and return the ServerDeps bag.
 *
 * Called once at startup before any runtime (api/worker/scheduler) starts.
 * The function is async for future-proofing (Phase 2A may need async init);
 * all current operations complete synchronously inside.
 *
 * Lifecycle handlers are registered LIFO — shutdown runs in reverse registration
 * order, which means: workers → redis → db (consumers before connections).
 */
export async function bootstrap(
  config: ServerConfig,
  kernelConfig: ResolvedKernelConfig | null,
) {
  // ─── Logger ─────────────────────────────────────────────────────────────────
  // Created first — every subsequent step uses it.
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

  // Configure the shared route-helper default realm BEFORE any route registers
  // with the runtime. Without this, extractOrgHeaders / resolveTenantId /
  // resolvePrincipalIdOrNull fall back to the legacy "athyper" literal even on
  // multi-realm deployments where the configured default differs.
  setDefaultRealmKey(kernelConfig?.iam.defaultRealmKey ?? config.iam.realm);

  // Phase C — Auth flag posture validation. Reads every AUTH_* flag, cross-
  // checks the invariants, and refuses to boot in production when the
  // configuration is silently unsafe (e.g. AUTH_PLATFORM_CONTEXT_GATE=on with
  // AUTH_CLAIM_FIRST_CONTEXT=off). Warnings are logged + counted; errors
  // throw and abort bootstrap so the orchestrator surfaces the bad deploy
  // (K8s CrashLoopBackOff, Compose restart loop, etc.).
  applyAuthFlagPostureValidation(config.env, kernelConfig, {
    logger,
    recordWarning: (rule, severity) => recordAuthFlagPostureWarning(rule, severity),
  });

  // ─── Fatal process handlers ──────────────────────────────────────────────────
  // Installed before adapter creation so async bootstrap failures are captured
  // rather than crashing silently with no structured log.
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled_rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    // Don't force exit — let in-flight requests/jobs finish; the next health
    // check will surface the problem if adapters are broken.
  });

  process.on("uncaughtException", (err) => {
    logger.fatal("uncaught_exception", { err: err.message, stack: err.stack });
    process.exit(1);
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  // Shutdown handlers are registered LIFO as adapters come online below.
  // Signal wiring happens inside each runtime's startXxx() function.
  const lifecycle = new Lifecycle();

  // ─── Circuit breakers — one per external dependency ──────────────────────────
  // OPEN circuit → adapter health contribution changes to "degraded".
  // Used by health checks in api.ts to surface partial degradation.
  const breakers = {
    db:   new CircuitBreaker("db",   { failureThreshold: 5, resetTimeoutMs: 20_000 }),
    redis: new CircuitBreaker("redis", { failureThreshold: 5, resetTimeoutMs: 15_000 }),
    auth:  new CircuitBreaker("auth",  { failureThreshold: 3, resetTimeoutMs: 30_000 }),
    objectStorage: new CircuitBreaker("objectStorage", { failureThreshold: 3, resetTimeoutMs: 30_000 }),
    jobs:  new CircuitBreaker("jobs",  { failureThreshold: 5, resetTimeoutMs: 20_000 }),
  };

  // ─── Credential encryption service ──────────────────────────────────────────
  // Shared AES-256-GCM encryption for Phase 4.1 (audit) and Phase 5.3 (integration).
  // F3 (B.2): Presence + ≥32-char length are enforced by the Zod schema in
  // config.ts — staging/production fail to start if the key is missing or short.
  // In local dev the key may be absent; encryption is disabled and routes that
  // require it will no-op (integration credentials fall back to plaintext).
  let credentialEncryption: ReturnType<typeof createCredentialEncryptionService> | null = null;
  if (config.credentialMasterKey) {
    credentialEncryption = createCredentialEncryptionService(config.credentialMasterKey);
  } else {
    logger.warn("credential_encryption_unavailable", {
      message: "CREDENTIAL_MASTER_KEY not set (local dev) — credential encryption disabled. Required for Phase 4.1/5.3.",
    });
  }

  // ─── DB ─────────────────────────────────────────────────────────────────────
  // tenantIdProvider binds withTenantTx to the request-context ALS. The id is
  // read from the authenticated session, not from service-code arguments, so a
  // service bug cannot stamp the wrong tenant on a transaction.
  //
  // onSkippedStamp / onRollbackFailure are wired to the Prometheus counters in
  // metrics.ts and structured logs so silent fail-closed reads (no tenant in
  // ALS) and dirty-connection rollback failures are observable in production.
  const onTenantStampSkipped = (
    reason: "no-tenant" | "invalid-uuid",
    value: unknown,
  ): void => {
    recordTenantStampSkipped(reason);
    if (reason === "invalid-uuid") {
      // invalid-uuid means a provider returned something — surface loudly,
      // it's a programming error somewhere upstream.
      logger.error("tenant_stamp_skipped_invalid_uuid", {
        requestId: tryGetContext()?.requestId,
        tenantIdValue: typeof value === "string" ? value : String(value),
      });
    }
    // no-tenant is the steady-state path for bootstrap/health/migrations and
    // happens many times per second — the counter is enough; no per-call log.
  };
  const onTenantStampRollbackFailure = (
    error: unknown,
    originalError: unknown,
  ): void => {
    logger.error("tenant_stamp_rollback_failed", {
      requestId: tryGetContext()?.requestId,
      err: error instanceof Error ? error.message : String(error),
      originalErr: originalError instanceof Error ? originalError.message : String(originalError),
    });
  };

  const db = createDbAdapter({
    connectionString: config.db.url,
    poolMax: config.db.poolMax,
    tenantIdProvider: () => tryGetContext()?.tenantId,
    onSkippedStamp: onTenantStampSkipped,
    onRollbackFailure: onTenantStampRollbackFailure,
    // Phase 1.5: wrap pool with retry policy (connection-level errors only)
    ...(config.env !== "local" ? { retryPolicy: DB_RETRY_POLICY } : {}),
  });
  lifecycle.onShutdown(() => db.close());

  const meshDb = config.meshDb?.url
    ? createDbAdapter({
        connectionString: config.meshDb.url,
        poolMax: config.meshDb.poolMax ?? 2,
        ...(config.env !== "local" ? { retryPolicy: DB_RETRY_POLICY } : {}),
      })
    : null;
  if (meshDb) lifecycle.onShutdown(() => meshDb.close());

  // ─── Redis ──────────────────────────────────────────────────────────────────
  //
  // Two-client policy (F1 isolation):
  //   `redis`             — shared cache client: JWKS, feature flags, OAuth2
  //                         token cache, IAM session cache, /readyz ping.
  //                         Uses bounded `maxRetriesPerRequest` so slow Redis
  //                         surfaces as request failures, not head-of-line blocking.
  //   `bullmqConnection`  — ConnectionOptions consumed by BullMQ Queues / Workers
  //                         / schedulers. `maxRetriesPerRequest: null` as
  //                         required by BullMQ Workers (blocking BRPOPLPUSH
  //                         behaves differently from command-path retries).
  //                         Passed as a plain object so BullMQ spawns a fresh
  //                         ioredis per Queue / Worker — a reconnect storm or
  //                         READONLY error on the cache client cannot cascade
  //                         to job coordination (and vice versa).
  //   REDIS_BULLMQ_URL    — optional override to point BullMQ at a different
  //                         Redis (different db index or dedicated instance).
  //                         Unset ⇒ reuses REDIS_URL on the same server.
  // `connectionName` surfaces in Redis `CLIENT LIST` so ops can tell which
  // consumer a connection belongs to during failover / incident triage.
  // BullMQ passes the option through to every Queue/Worker ioredis instance.
  const redis = createRedisClient({
    ...parseRedisUrl(config.redis.url),
    connectionName: "athyper-cache",
    connectTimeout: config.redis.connectTimeout,
    maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
    errorLogCooldownMs: config.redis.errorLogCooldownMs,
    logger,
  });
  lifecycle.onShutdown(() => redis.disconnect());

  const descriptorCache = {
    get: (k: string) => redis.get(k),
    set: async (k: string, v: string, ttl: number): Promise<void> => {
      await redis.set(k, v, "EX", ttl);
    },
    del: async (k: string): Promise<void> => {
      await redis.del(k);
    },
  };

  const bullmqRedisUrl = config.redis.bullmqUrl || config.redis.url;
  const bullmqConnection = {
    ...parseRedisUrl(bullmqRedisUrl),
    connectionName: "athyper-bullmq",
    connectTimeout: config.redis.connectTimeout,
    maxRetriesPerRequest: null,
  } satisfies RedisClientOptions;
  if (config.redis.bullmqUrl) {
    logger.info("redis_bullmq_dedicated", { url: config.redis.bullmqUrl });
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────
  // When kernel config is available use its realm IAM (multi-realm, allowedAzp).
  // Otherwise fall back to the flat env-var IAM config.
  const defaultRealm = kernelConfig ? getDefaultRealm(kernelConfig) : null;

  const auth = createAuthAdapter({
    issuerUrl: defaultRealm?.iam.issuerUrl ?? config.iam.issuerUrl,
    clientId: defaultRealm?.iam.clientId ?? config.iam.clientId,
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

  // ─── Object storage (optional) ──────────────────────────────────────────────
  // When S3_ENDPOINT is absent the ref stays null and attachment routes return
  // 503 with STORAGE_UNAVAILABLE. The health contributor reports "degraded"
  // (not "unhealthy") so a missing S3 config does not block startup.
  //
  // ref.current may also be nulled asynchronously if bucket validation fails.
  // Callers must always read objectStorageRef.current at use time.
  const objectStorageRef: { current: ObjectStorageAdapter | null } = {
    current: null,
  };

  if (config.objectStorage) {
    const adapter = createS3ObjectStorageAdapter({
      ...config.objectStorage,
      logger,
    });
    objectStorageRef.current = adapter;

    logger.info("object_storage_configured", {
      endpoint: config.objectStorage.endpoint,
      bucket: config.objectStorage.bucket,
    });

    // Bucket existence + permission validation — runs once, non-blocking.
    // Failure nulls the ref so routes degrade gracefully instead of emitting
    // opaque S3 errors per request.
    adapter
      .validateBucketAccess()
      .then(() => {
        logger.info("object_storage_bucket_validated", {
          bucket: config.objectStorage!.bucket,
          endpoint: config.objectStorage!.endpoint,
        });
      })
      .catch((err: unknown) => {
        logger.warn("object_storage_bucket_validation_failed", {
          bucket: config.objectStorage!.bucket,
          endpoint: config.objectStorage!.endpoint,
          err: err instanceof Error ? err.message : String(err),
        });
        objectStorageRef.current = null;
      });
  } else {
    logger.warn("object_storage_not_configured", {
      message: "S3_ENDPOINT absent — attachment routes will return 503",
    });
  }

  // ─── Audit ──────────────────────────────────────────────────────────────────
  // Console writer in local dev — switched to DB writer in staging/production
  // now that dbAdapter is ready. Route handlers use writeRouteAudit() directly.
  const objectStorage = config.objectStorage
    ? createObjectStorageRefAdapter(objectStorageRef)
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _db = db.kysely as unknown as import("kysely").Kysely<Record<string, any>>;
  const runtimeMode = (process.env["MODE"] ?? "api").trim().toLowerCase();
  const jobWorkersEnabled = runtimeMode === "worker";
  let audit: AuditWriter = createConsoleAuditWriter();
  if (config.env !== "local") {
    audit = createDbAuditWriter(_db);
  }

  // ─── Jobs service ───────────────────────────────────────────────────────────
  // Created before routes so queues are available for the admin API.
  // Schedulers and workers are activated inside each runtime's startXxx().
  const inAppChannelHandler: NotificationChannelHandler = {
    // in_app delivery is the notification_delivery row itself — no dispatch.
    // The frontend reads it directly; no external call needed.
    send: async () => ({ externalId: undefined }),
    healthCheck: async () => "healthy",
  };

  const channelHandlers = new Map<string, NotificationChannelHandler>([
    ["in_app", inAppChannelHandler],
    ["webhook", createWebhookAdapter()],
    ...(config.email
      ? ([
          [
            "email",
            createEmailAdapter({
              host:         config.email.host,
              port:         config.email.port,
              secure:       config.email.secure ?? false,
              user:         config.email.user,
              pass:         config.email.pass,
              from_address: config.email.from_address,
              logger,
            }),
          ],
        ] as [string, NotificationChannelHandler][])
      : []),
    ...(config.sms
      ? ([
          [
            "sms",
            createSmsAdapter({
              accountSid:          config.sms.accountSid,
              authToken:           config.sms.authToken,
              fromNumber:          config.sms.fromNumber,
              messagingServiceSid: config.sms.messagingServiceSid,
            }),
          ],
        ] as [string, NotificationChannelHandler][])
      : []),
    ...(config.push
      ? ([
          [
            "push",
            createPushAdapter(
              {
                fcmProjectId:            config.push.fcmProjectId,
                fcmServiceAccountKeyJson: config.push.fcmServiceAccountKeyJson,
                vapidSubject:            config.push.vapidSubject,
                vapidPublicKey:          config.push.vapidPublicKey,
                vapidPrivateKey:         config.push.vapidPrivateKey,
              },
              _db,
            ),
          ],
        ] as [string, NotificationChannelHandler][])
      : []),
  ]);

  // ─── Cross-entity search — Track B2 ─────────────────────────────────────────
  // Created BEFORE createJobsService so the search outbox handler can be
  // wired into topicHandlers at construction. Null when SEARCHCORE_URL +
  // SEARCHCORE_MASTER_KEY are unset — /api/search returns 503 and the
  // search outbox topic handler is not registered.
  //
  // Warm-up (ensureIndex + scoped-key provisioning) runs inside
  // lifecycle.onReady() with exponential-backoff retry — a slow or unreachable
  // Meili must not block runtime startup. The outbox handler and /api/search
  // route gate on searchService.isReady() so indexing defers until warm-up
  // completes and tenant queries return 503 SEARCH_WARMING in the meantime.
  // The health check reports "degraded" (not "unhealthy") during warm-up so
  // /readyz stays 200 and orchestrators keep routing traffic — search is a
  // convenience, not a transaction-processing prerequisite.
  const meilisearchClient = createMeilisearchClient({ logger });
  let searchService: SearchService | null = null;
  if (meilisearchClient && config.meilisearch?.masterKey) {
    searchService = createSearchService({
      client: meilisearchClient,
      logger,
    });
    lifecycle.onReady(() => {
      void searchService!.warmUp().catch((err: unknown) => {
        logger.warn("meilisearch_warmup_exited", {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    });
    lifecycle.onShutdown(() => searchService!.stopWarmUp());
    logger.info("meilisearch_configured", {
      url: config.meilisearch.url,
    });
  }

  const topicHandlers = new Map([
    ["wf", createWfOutboxHandler(_db)],
  ] as Array<[string, import("@athyper/svc-jobs").OutboxTopicHandler]>);
  if (searchService) {
    // Per-entity enrichment overrides — the generic handler falls back to
    // defaultRowToSearchDocument for any entity not listed here.
    const searchOverrides = new Map<string, EntityDocumentOverride>([
      [INVOICE_ENTITY_TYPE,       invoiceOverride],
      [JOURNAL_ENTRY_ENTITY_TYPE, journalEntryOverride],
    ]);
    topicHandlers.set("search", createSearchOutboxHandler({
      db:        _db,
      search:    searchService,
      overrides: searchOverrides,
      logger,
    }));
  }

  // ─── PDF Renderer client — Gotenberg first, legacy fallback ─────────────────
  // Constructed before createJobsService so the render-document worker can be
  // injected with the same client used by the synchronous RenderService.
  // Null when DOCRENDER_BASE_URL is unset; in that state the worker writes
  // a permanent MISSING_RENDERER DLQ row per job and emits an ops_alert
  // event — surface-loud rather than silently dropping renders.
  const gotenberg = createGotenbergClient({ logger });
  const pdfRenderer = gotenberg ?? createPdfRendererClient({ logger });
  if (gotenberg) {
    logger.info("gotenberg_renderer_configured", {
      baseUrl: process.env["DOCRENDER_BASE_URL"],
    });
  } else if (!pdfRenderer) {
    const log = config.env === "local" ? logger.info.bind(logger) : logger.warn.bind(logger);
    log("pdf_renderer_not_configured", {
      message: "Neither DOCRENDER_BASE_URL nor RENDERER_BASE_URL+RENDERER_INTERNAL_TOKEN set - PDF rendering disabled",
    });
  }

  // ─── Tika text extraction — Track B2.2 ──────────────────────────────────────
  // Worker runtime creates the Tika consumer when BOTH tikaUrl and an object
  // storage adapter are present. API/scheduler receive queue handles only.
  const tikaUrl = process.env["DOCPARSER_URL"]?.trim() || undefined;
  const attachmentStorage = objectStorage
    ? { get: (key: string) => objectStorage.get(key) }
    : undefined;

  // ─── Backup object storage (I-07, I-11) ─────────────────────────────────────
  // Separate adapter instance so backup objects land in BACKUP_S3_BUCKET, which
  // can have independent lifecycle policies and access controls from the main
  // application bucket. Falls back to the main bucket when BACKUP_S3_BUCKET is
  // unset (local dev only — validate-env.sh rejects the missing var in staging/production).
  // BACKUP_S3_ACCESS_KEY / BACKUP_S3_SECRET_KEY are the scoped athyper-backup
  // MinIO credentials (I-11). Both fall back to app credentials in local dev.
  let backupStorage: BackupObjectStorage | undefined;
  if (config.objectStorage) {
    const backupBucket      = process.env["BACKUP_S3_BUCKET"]?.trim() || config.objectStorage.bucket;
    const backupAccessKey   = process.env["BACKUP_S3_ACCESS_KEY"]?.trim() || config.objectStorage.accessKey;
    const backupSecretKey   = process.env["BACKUP_S3_SECRET_KEY"]?.trim() || config.objectStorage.secretKey;
    const backupAdapter = createS3ObjectStorageAdapter({
      ...config.objectStorage,
      bucket:    backupBucket,
      accessKey: backupAccessKey,
      secretKey: backupSecretKey,
      logger,
    });
    backupStorage = backupAdapter;
    logger.info("backup_storage_configured", {
      endpoint: config.objectStorage.endpoint,
      bucket:   backupBucket,
    });
  } else {
    logger.warn("backup_storage_not_configured", {
      message: "S3_ENDPOINT absent — backup worker inactive; db-snapshots will not be taken",
    });
  }

  const emailFromMap: Map<string, string> | undefined = config.email
    ? new Map([
        ["neon",  config.email.from_neon  ?? config.email.from_address],
        ["mesh",  config.email.from_mesh  ?? config.email.from_address],
        ["admin", config.email.from_admin ?? config.email.from_address],
      ])
    : undefined;

  const jobs = createJobsService({
    db: _db,
    connection: bullmqConnection,
    logger,
    topicHandlers,
    channelHandlers,
    emailFromMap,
    gotenberg,
    renderStorage: objectStorage ?? undefined,
    tikaUrl,
    attachmentStorage,
    backupStorage,
    workersEnabled: jobWorkersEnabled,
    hooks: {
      onCompleted: (queue, jobName) => pingSuccess(queue, jobName),
      onFailed: (queue, jobName, err) =>
        pingFail(queue, jobName, err instanceof Error ? err.message : String(err)),
      // B.9: surface terminally failed jobs to GlitchTip/Sentry. onFailed
      // above pings Healthchecks on every attempt; this fires ONCE per job
      // after retries are exhausted, so alert volume stays bounded.
      onTerminalFailure: (queue, jobName, err, meta) => {
        try {
          const e = err instanceof Error ? err : new Error(String(err));
          Sentry.captureException(e, {
            tags:  { queue, jobName, terminal: "true" },
            extra: {
              jobId:        meta.jobId,
              attemptsMade: meta.attemptsMade,
              maxAttempts:  meta.maxAttempts,
              data:         meta.data,
            },
          });
        } catch { /* swallow — Sentry transport must never block the worker */ }
      },
      // B.9: boot-time queue health alerts (e.g. Tika queue has pending jobs
      // but DOCPARSER_URL is unset, so no consumer will drain them). Warning-level
      // message since the service still boots; the condition is operational.
      onQueueAlert: (queue, reason, details) => {
        try {
          Sentry.captureMessage(`queue_alert:${queue}:${reason}`, {
            level: "warning",
            tags:  { queue, reason, alert: "queue_health" },
            extra: details,
          });
        } catch { /* swallow */ }
      },
    },
  });

  // ─── Webhook Delivery Worker — Sprint 30 ─────────────────────────────────────
  // Fans out pending event.outbox rows to matching webhook subscriptions.
  // This owns a BullMQ Worker instance, so only MODE=worker constructs it.
  // API and scheduler runtimes keep queue producers and scheduler refreshes
  // separate from job consumers.
  let webhookDelivery: WebhookDeliveryWorkerResult | null = null;
  if (jobWorkersEnabled) {
    const webhookRedis = createRedisClient({
      ...bullmqConnection,
      errorLogCooldownMs: config.redis.errorLogCooldownMs,
      logger,
    });
    lifecycle.onShutdown(() => webhookRedis.disconnect());
    webhookDelivery = createWebhookDeliveryWorker(_db as never, webhookRedis, logger);
    lifecycle.onShutdown(async () => {
      await Promise.all([
        webhookDelivery!.worker.close(),
        webhookDelivery!.queue.close(),
      ]);
    });
  }

  // ─── Feature flag service ────────────────────────────────────────────────────
  // Phase 1.6: Redis cache-first, DB fallback. <1ms p99 cache hit.
  // Constructed here so it can be passed to any route/service that needs flag checks.
  const featureFlags = createFeatureFlagService({
    redis: {
      get:   (k: string) => redis.get(k),
      setex: (k: string, s: number, v: string) => redis.setex(k, s, v),
    },
    db: _db,
    logger,
  });

  // ─── Service registry ────────────────────────────────────────────────────────
  // Phase 1.3: shared Map placeholder; populated inside startApi() by
  // the ServiceRegistry wrapper.  The Map reference is stable — passed by
  // reference to ServiceRegistry so services can register health checks via
  // deps.registry before the /healthz handler reads them.
  const serviceHealthChecks = new Map<string, HealthCheck>();
  const registry = new ServiceRegistry(serviceHealthChecks);

  // Cross-entity search health contributor. Reports "degraded" during
  // warm-up instead of "unhealthy" so /readyz stays 200 — search is a
  // convenience feature, not a transaction-processing prerequisite, and
  // holding readiness open would take the whole platform offline whenever
  // Meilisearch is slow. Omitted entirely when Meili is not configured.
  if (searchService) {
    const s = searchService;
    registry.registerHealthCheck("search", async (): Promise<HealthContribution> => {
      const state = s.getState();
      if (state.status === "ready")    return { status: "healthy" };
      if (state.status === "warming")  return {
        status:  "degraded",
        message: `search_warming (attempt=${state.attempt}${state.lastError ? `, err=${state.lastError.slice(0, 120)}` : ""})`,
      };
      if (state.status === "stopped")  return { status: "degraded", message: "search_stopped" };
      return { status: "degraded", message: "search_not_started" };
    });
  }

  // ─── OAuth2 token cache + HTTP connector — Phase 5.3 ────────────────────────
  registry.registerHealthCheck("tika", async (): Promise<HealthContribution> => {
    if (!tikaUrl) {
      return { status: "degraded", message: "tika_url_not_configured" };
    }
    if (!jobs.tikaExtractEnabled) {
      return {
        status:  "degraded",
        message: attachmentStorage
          ? "tika_worker_inactive"
          : "tika_worker_inactive_object_storage_not_configured",
      };
    }
    return checkTikaEndpoint(tikaUrl);
  });

  const oauth2TokenCache = createOAuth2TokenCache({
    get:   (k: string) => redis.get(k),
    setex: (k: string, s: number, v: string) => redis.setex(k, s, v),
  });
  const httpConnector = createHttpConnectorClient({
    encryption:  credentialEncryption ?? undefined,
    tokenCache:  oauth2TokenCache,
    breaker:     breakers.auth, // reuse auth circuit breaker for external API calls
  });

  // ─── Sync RenderService ─────────────────────────────────────────────────────
  // Uses the same Gotenberg client as the BullMQ render-document worker
  // (constructed above before createJobsService).
  const renderService = createRenderService(_db, pdfRenderer, objectStorage);

  // ─── Phase 6.2 — Persona Registry ───────────────────────────────────────────
  const personaRegistry = createPersonaRegistryService(_db);

  // ─── Phase 6.3 — Company-Code Scope Resolution ───────────────────────────────
  const companyCodeScope = createCompanyCodeScopeService(_db);

  // ─── Phase 6.4 — Notification Orchestrator + Mention Service ─────────────────
  // NotificationOrchestrator requires the notifications BullMQ queue.
  // The queue is ready after createJobsService(). jobs.queues.notifications is
  // a Queue instance with the correct generic type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notificationOrchestrator = createNotificationOrchestrator(_db, jobs.queues.notifications as any, logger);
  const mentionService = createMentionService(_db, notificationOrchestrator);

  // ─── Metadata Approval Bridge — Phase 3.4 wiring ────────────────────────────
  // Created now (Phase 2.5 skeleton). Wire() is called in lifecycle.onReady()
  // after all services are initialised so WorkflowEngine and EntityCompilerService
  // are guaranteed to be ready.
  const metadataApprovalBridge = createMetadataApprovalBridge(_db);
  const entityCompiler = createEntityCompilerService(_db, logger);
  const approverResolver = new ApproverResolverService({ db: _db, logger: { warn: (e, f) => logger.warn?.(e, f) } });
  const workflowEngine = new WorkflowEngine({ db: _db, logger, approverResolver });

  lifecycle.onReady(() => {
    metadataApprovalBridge.wire({
      workflowEngine: {
        createRequest: (tenantId: string, entityType: string, entityId: string, requestedBy: string) =>
          workflowEngine.createRequest({
            tenantId,
            entityType,
            entityId,
            payload:     {},
            requestedBy,
          }).then((r) => r.id),
      },
      entityCompiler: {
        invalidate: async (code: string, tenantId?: string) => {
          entityCompiler.invalidate(code);
          if (tenantId) {
            await invalidateDescriptorCache(descriptorCache, tenantId, code);
          }
        },
      },
    });

    logger.info("metadata_approval_bridge_wired", {
      phase: "3.4",
    });
  });

  return {
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
    // Phase 1.3 — service health registry
    registry,
    serviceHealthChecks,
    // Phase 1.5 — circuit breakers exposed for health check wiring in api.ts
    breakers,
    // Phase 1.6 — feature flag service
    featureFlags,
    // Phase 1.7 — shared encryption service (null when key not configured)
    credentialEncryption,
    // Phase 3.4 — metadata approval bridge + supporting services
    metadataApprovalBridge,
    entityCompiler,
    workflowEngine,
    // Phase 5.1 — PDF rendering
    pdfRenderer,
    renderService,
    // Phase 5.3 — HTTP connector + OAuth2 token cache
    httpConnector,
    oauth2TokenCache,
    // Phase 6.2 — Persona Registry
    personaRegistry,
    // Phase 6.3 — Company-Code Scope Resolution
    companyCodeScope,
    // Phase 6.4 — Notification Orchestrator + Mention Service
    notificationOrchestrator,
    mentionService,
    // Sprint 30 — Webhook delivery worker (HMAC-signed outbound webhooks)
    webhookDelivery,
    // Track B2 — Meilisearch cross-entity search (null when not configured)
    searchService,
  };
}
