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
import { createRedisClient } from "@athyper/adapter-memorycache";
import { createAuthAdapter } from "@athyper/adapter-auth";
import {
  createS3ObjectStorageAdapter,
  type ObjectStorageAdapter,
} from "@athyper/adapter-objectstorage";
import {
  createJobsService,
  createWfOutboxHandler,
  type NotificationChannelHandler,
} from "@athyper/svc-jobs";

import {
  CircuitBreaker,
  DB_RETRY_POLICY,
  REDIS_RETRY_POLICY,
} from "../foundation/resilience/index.js";
import { createCredentialEncryptionService } from "../foundation/crypto/credential-encryption.service.js";
import { ServiceRegistry, type HealthCheck } from "../foundation/registry/service-registry.js";
import { createFeatureFlagService } from "../foundation/features/feature-flag.service.js";
import { createMetadataApprovalBridge } from "../foundation/metadata/metadata-approval-bridge.js";
import { createEntityCompilerService } from "../foundation/metadata/entity-compiler.service.js";
import { WorkflowEngine } from "../../framework/runtime/services/workflow/engine.js";
import { ApproverResolverService } from "../../framework/runtime/services/workflow/approver-resolver.service.js";
import { createPdfRendererClient } from "../foundation/render/pdf-renderer-client.js";
import { createRenderService } from "../foundation/render/render.service.js";
import { createHttpConnectorClient, createOAuth2TokenCache } from "../foundation/integration/http-connector-client.js";
import { createPersonaRegistryService } from "../foundation/iam/persona-registry.service.js";
import { createCompanyCodeScopeService } from "../foundation/iam/company-code-scope.service.js";
import { createMentionService } from "../foundation/collab/mention.service.js";
import { createNotificationOrchestrator } from "../foundation/notifications/notification-orchestrator.js";

import { createEmailAdapter } from "../../framework/runtime/services/jobs/adapters/email.adapter.js";
import { createWebhookAdapter } from "../../framework/runtime/services/jobs/adapters/webhook.adapter.js";
import { createSmsAdapter } from "../../framework/runtime/services/jobs/adapters/sms.adapter.js";
import { createPushAdapter } from "../../framework/runtime/services/jobs/adapters/push.adapter.js";
import { createWebhookDeliveryWorker } from "../../framework/runtime/services/jobs/workers/webhook-delivery.worker.js";

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
  };
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

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
  // CREDENTIAL_MASTER_KEY env var required in staging/production.
  // In local dev, falls back to a deterministic warning — routes that need
  // encryption will work but key is not production-safe.
  let credentialEncryption = null as ReturnType<typeof createCredentialEncryptionService> | null;
  try {
    credentialEncryption = createCredentialEncryptionService();
  } catch {
    logger.warn("credential_encryption_unavailable", {
      message: "CREDENTIAL_MASTER_KEY not set or too short — credential encryption disabled. Required for Phase 4.1/5.3.",
    });
  }

  // ─── DB ─────────────────────────────────────────────────────────────────────
  const db = createDbAdapter({
    connectionString: config.db.url,
    poolMax: config.db.poolMax,
    // Phase 1.5: wrap pool with retry policy (connection-level errors only)
    ...(config.env !== "local" ? { retryPolicy: DB_RETRY_POLICY } : {}),
  });
  lifecycle.onShutdown(() => db.close());

  // ─── Redis ──────────────────────────────────────────────────────────────────
  const redis = createRedisClient({
    ...parseRedisUrl(config.redis.url),
    connectTimeout: config.redis.connectTimeout,
    maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
    errorLogCooldownMs: config.redis.errorLogCooldownMs,
    logger,
  });
  lifecycle.onShutdown(() => redis.disconnect());

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
        logger.error("object_storage_bucket_validation_failed", {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _db = db.kysely as unknown as import("kysely").Kysely<Record<string, any>>;
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

  const jobs = createJobsService({
    db: _db,
    redisUrl: config.redis.url,
    logger,
    topicHandlers: new Map([["wf", createWfOutboxHandler(_db)]]),
    channelHandlers,
  });

  // ─── Webhook Delivery Worker — Sprint 30 ─────────────────────────────────────
  // Fans out pending event.outbox rows to matching webhook subscriptions.
  // Signs each delivery with HMAC-SHA256 if signing_secret is configured.
  // BullMQ Workers require maxRetriesPerRequest: null — use a dedicated connection.
  const webhookRedis = createRedisClient({
    ...parseRedisUrl(config.redis.url),
    connectTimeout: config.redis.connectTimeout,
    maxRetriesPerRequest: null,
    errorLogCooldownMs: config.redis.errorLogCooldownMs,
    logger,
  });
  lifecycle.onShutdown(() => webhookRedis.disconnect());
  const webhookDelivery = createWebhookDeliveryWorker(_db, webhookRedis, logger);

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

  // ─── OAuth2 token cache + HTTP connector — Phase 5.3 ────────────────────────
  const oauth2TokenCache = createOAuth2TokenCache({
    get:   (k: string) => redis.get(k),
    setex: (k: string, s: number, v: string) => redis.setex(k, s, v),
  });
  const httpConnector = createHttpConnectorClient({
    encryption:  credentialEncryption ?? undefined,
    tokenCache:  oauth2TokenCache,
    breaker:     breakers.auth, // reuse auth circuit breaker for external API calls
  });

  // ─── PDF Renderer client — Phase 5.1 ────────────────────────────────────────
  // Null when RENDERER_BASE_URL or RENDERER_INTERNAL_TOKEN is not configured.
  // RenderService degrades gracefully: render_output rows created with FAILED status.
  const pdfRenderer = createPdfRendererClient({ logger });
  if (!pdfRenderer) {
    logger.warn("pdf_renderer_not_configured", {
      message: "RENDERER_BASE_URL or RENDERER_INTERNAL_TOKEN not set — PDF rendering disabled",
    });
  }
  const renderService = createRenderService(_db, pdfRenderer, objectStorageRef.current);

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
  const entityCompiler = createEntityCompilerService(_db);
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
        invalidate: (code: string) => entityCompiler.invalidate(code),
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
  };
}
