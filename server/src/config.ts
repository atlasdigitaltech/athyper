// server/src/config.ts
//
// Zod-validated server configuration.
// Reads from process.env (after dotenv) and fails fast at startup
// with a clear error message if any required value is missing or invalid.
//
// Env var naming supports both Docker stack (IAM_*, DB_*) and local dev
// (KEYCLOAK_*, DATABASE_URL) conventions — same as before, now validated.

import { z } from "zod";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safe boolean coercion: true/false/1/0/yes/no/on/off → boolean */
const Bool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }
  return v;
}, z.boolean());

// ─── Schema ──────────────────────────────────────────────────────────────────

const ServerConfigSchema = z.object({
  env: z.enum(["local", "staging", "production"]).default("local"),
  port: z.coerce.number().int().positive().default(4000),
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  shutdownTimeoutMs: z.coerce.number().int().positive().default(15_000),

  /**
   * Master key for AES-256-GCM field encryption (audit PII, integration
   * credentials). Must be ≥32 characters — shorter keys cannot yield the
   * 256-bit KEK that CredentialEncryptionService derives via PBKDF2.
   * Required in staging/production; optional in local dev (encryption is
   * disabled when absent).
   */
  credentialMasterKey: z
    .string()
    .min(32, "CREDENTIAL_MASTER_KEY must be at least 32 characters")
    .optional(),

  db: z.object({
    url: z.string().min(1, "DATABASE_URL is required"),
    poolMax: z.coerce.number().int().positive().default(5),
  }),

  redis: z.object({
    url: z.string().min(1, "REDIS_URL is required"),
    /**
     * Optional dedicated Redis URL for BullMQ (queues, workers, schedulers).
     * When unset, BullMQ reuses `url` but with its own connection options
     * (maxRetriesPerRequest: null). Set this to point BullMQ at a different
     * Redis server or db index (e.g. redis://host:6379/1) so a READONLY error
     * or reconnect storm on the cache client cannot cascade to job coordination.
     */
    bullmqUrl: z.string().optional(),
    /** Hard timeout for the initial TCP connection (ioredis: connectTimeout). */
    connectTimeout:       z.coerce.number().int().min(100).default(5_000),
    /** Max retries per request before failing fast (ioredis: maxRetriesPerRequest). */
    maxRetriesPerRequest: z.coerce.number().int().min(0).max(10).default(2),
    /** Minimum ms between error log emissions per event type (throttle, not TTL). */
    errorLogCooldownMs:   z.coerce.number().int().min(0).default(10_000),
  }),

  iam: z.object({
    issuerUrl: z.string().url("IAM issuer URL must be a valid URL"),
    realm: z.string().min(1).default("athyper"),
    clientId: z.string().min(1).default("athyper-api"),
    clientSecret: z.string().default(""),
  }),

  outbox: z
    .object({
      pollIntervalMs: z.coerce.number().int().positive().default(10_000),
    })
    .default({ pollIntervalMs: 10_000 }),

  /**
   * Email (SMTP / nodemailer).
   * Optional — when absent the email notification channel is not registered.
   */
  email: z
    .object({
      host:         z.string().min(1),
      port:         z.coerce.number().int().positive().default(587),
      secure:       z.boolean().default(false),
      user:         z.string().default(""),
      pass:         z.string().default(""),
      from_address: z.string().default(""),
    })
    .optional(),

  /**
   * SMS (Twilio).
   * Optional — when absent the sms notification channel is not registered.
   * Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
   * Optional: TWILIO_MESSAGING_SERVICE_SID (preferred over FROM_NUMBER for pool delivery).
   */
  sms: z
    .object({
      accountSid:          z.string().min(1),
      authToken:           z.string().min(1),
      fromNumber:          z.string().min(1),
      messagingServiceSid: z.string().optional(),
    })
    .optional(),

  /**
   * Push notifications — FCM HTTP v1 (Android/iOS) + VAPID Web Push (browser).
   * Optional — when absent the push notification channel is not registered.
   *
   * FCM env vars (required for Android/iOS push):
   *   PUSH_FCM_PROJECT_ID          — Firebase project ID
   *   PUSH_FCM_SERVICE_ACCOUNT_KEY — JSON string of GCP service account key file
   *
   * VAPID env vars (required for browser Web Push):
   *   VAPID_SUBJECT     — "mailto:noreply@example.com" or "https://example.com"
   *   VAPID_PUBLIC_KEY  — base64url uncompressed P-256 public key (65 bytes)
   *   VAPID_PRIVATE_KEY — base64url raw P-256 private key (32 bytes)
   *
   * Generate VAPID keys: npx web-push generate-vapid-keys
   */
  push: z
    .object({
      fcmProjectId:            z.string().optional(),
      fcmServiceAccountKeyJson: z.string().optional(),
      vapidSubject:            z.string().optional(),
      vapidPublicKey:          z.string().optional(),
      vapidPrivateKey:         z.string().optional(),
    })
    .optional(),

  /**
   * Object storage (S3 / MinIO).
   * Optional — when absent, attachment routes return 503 and the health
   * check reports this contributor as degraded rather than unhealthy.
   */
  objectStorage: z
    .object({
      endpoint:  z.string().url("S3_ENDPOINT must be a valid URL"),
      accessKey: z.string().min(1, "S3_ACCESS_KEY is required"),
      secretKey: z.string().min(1, "S3_SECRET_KEY is required"),
      region:    z.string().default("us-east-1"),
      bucket:    z.string().min(1, "S3_BUCKET is required"),
      useSSL:    Bool.default(false),
      /**
       * Multipart upload part size in MiB. S3/MinIO minimum is 5 MiB.
       * Larger parts reduce request count but increase memory per part.
       */
      multipartPartSizeMb: z.coerce.number().int().min(5).default(5),
      /**
       * Number of concurrent part uploads per multipart operation.
       * Higher values increase throughput on fast connections.
       */
      multipartQueueSize:  z.coerce.number().int().min(1).max(16).default(4),
      /**
       * Maximum file upload size in MiB (enforced by the multipart route).
       * Base64 JSON uploads are already capped by the Express body parser.
       */
      maxUploadMb: z.coerce.number().int().min(1).default(100),
      /**
       * Presigned URL validity in seconds (for Release 3 direct-to-S3 uploads).
       * 900 s = 15 minutes — narrow window reduces misuse risk.
       */
      presignedTtlSeconds: z.coerce.number().int().min(60).default(900),
    })
    .optional(),

  /**
   * ClamAV daemon — virus scanning for CMS attachment uploads.
   * Optional — when absent, uploads proceed without scanning (is_virus_scanned=false).
   * Required env vars: CLAMD_HOST, CLAMD_PORT (default 3310).
   */
  clamd: z
    .object({
      host:    z.string().min(1),
      port:    z.coerce.number().int().positive().default(3310),
      /** Scan timeout in ms. Default: 10 000. */
      timeoutMs: z.coerce.number().int().positive().default(10_000),
      /**
       * fail-closed (default): unreachable clamd blocks the upload with 503.
       * fail-open: unreachable clamd allows the upload through (is_virus_scanned=false).
       *   Only permitted when env="local" — the startup preflight rejects fail-open
       *   in staging/production so an outage cannot silently bypass virus scanning.
       */
      onUnavailable: z.enum(["fail-open", "fail-closed"]).default("fail-closed"),
    })
    .optional(),

  /**
   * GlitchTip / Sentry-compatible error tracking.
   * Optional — when GLITCHTIP_DSN is unset, the Sentry SDK is a no-op.
   * DSN is generated from the GlitchTip admin UI per project.
   */
  sentry: z
    .object({
      dsn:               z.string().min(1),
      tracesSampleRate:  z.coerce.number().min(0).max(1).default(0),
    })
    .optional(),

  /**
   * Healthchecks cron-heartbeat pings.
   * Optional — when HEALTHCHECKS_BASE_URL is unset, hooks are no-ops.
   * Base URL format: https://healthchecks.athyper.local/ping
   */
  healthchecks: z
    .object({
      baseUrl: z.string().url(),
    })
    .optional(),

  /**
   * Gotenberg HTML/Office → PDF converter. Preferred over the legacy
   * RENDERER_BASE_URL when both are set.
   */
  gotenberg: z
    .object({
      baseUrl:   z.string().url(),
      timeoutMs: z.coerce.number().int().positive().default(120_000),
    })
    .optional(),

  /**
   * Meilisearch cross-entity search (Track B2).
   * Optional — when unset, /api/search returns 503 and the indexing worker
   * (Slice B) is inert.
   *
   * The master key authenticates admin operations only: index creation,
   * document upserts/deletes, and provisioning the scoped search-only key
   * used to sign tenant tokens. The scoped key is derived from the master
   * key at boot (see SearchService.warmUp → ensureTenantTokenSignerKey).
   */
  meilisearch: z
    .object({
      url:       z.string().url(),
      masterKey: z.string().min(1),
    })
    .optional(),

  /**
   * Platform-control realm: product admins authenticate via a dedicated
   * Keycloak realm and switch into any tenant's context (read-only, v1).
   * Disabled by default — enable via PLATFORM_CONTROL_ENABLED=true.
   */
  platformControl: z
    .object({
      enabled: Bool.default(false),
      /** The realmKey that identifies the platform-control Keycloak realm. */
      realmKey: z.string().min(1).default("platform-control"),
      /**
       * Keycloak realm role names (realm_access.roles) for each platform role.
       * Override via config if your KC realm uses different role names.
       */
      roles: z
        .object({
          productAdmin: z.string().default("PRODUCT_ADMIN"),
          tenantManager: z.string().default("TENANT_MANAGER"),
          supportAdmin: z.string().default("SUPPORT_ADMIN"),
          readOnlySupport: z.string().default("READ_ONLY_SUPPORT"),
        })
        .default({ productAdmin: "PRODUCT_ADMIN", tenantManager: "TENANT_MANAGER", supportAdmin: "SUPPORT_ADMIN", readOnlySupport: "READ_ONLY_SUPPORT" }),
      /** Allowed operations per platform role. */
      rolePermissions: z
        .record(z.string(), z.array(z.string()))
        .default({
          PRODUCT_ADMIN: [
            "tenant:list",
            "tenant:switch",
            "tenant:manage",
            "platform:configure",
          ],
          TENANT_MANAGER: ["tenant:list", "tenant:switch", "tenant:manage"],
          SUPPORT_ADMIN: ["tenant:list", "tenant:switch"],
          READ_ONLY_SUPPORT: ["tenant:list"],
        }),
    })
    .default({
      enabled: false,
      realmKey: "platform-control",
      roles: { productAdmin: "PRODUCT_ADMIN", tenantManager: "TENANT_MANAGER", supportAdmin: "SUPPORT_ADMIN", readOnlySupport: "READ_ONLY_SUPPORT" },
      rolePermissions: { PRODUCT_ADMIN: ["tenant:list","tenant:switch","tenant:manage","platform:configure"], TENANT_MANAGER: ["tenant:list","tenant:switch","tenant:manage"], SUPPORT_ADMIN: ["tenant:list","tenant:switch"], READ_ONLY_SUPPORT: ["tenant:list"] },
    }),
}).superRefine((data, ctx) => {
  // CREDENTIAL_MASTER_KEY is required in staging/production. The .min(32)
  // check above runs only when the field is present; this catches the
  // "missing in non-local" case centrally instead of relying on bootstrap.
  if (data.env !== "local" && !data.credentialMasterKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["credentialMasterKey"],
      message:
        "CREDENTIAL_MASTER_KEY is required in staging/production (≥32 characters)",
    });
  }
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load and validate server config from process.env.
 * Throws with a clear human-readable error if any required value is missing
 * or malformed — intended to be called once at startup before adapter creation.
 */
export function loadConfig(): ServerConfig {
  // IAM issuer URL — support Docker stack (IAM_ISSUER_URL) and local dev
  // (KEYCLOAK_BASE_URL + KEYCLOAK_REALM) naming conventions
  const issuerUrl =
    process.env.IAM_ISSUER_URL ??
    (() => {
      const base =
        process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";
      const realm = process.env.KEYCLOAK_REALM ?? "athyper";
      return `${base}/realms/${realm}`;
    })();

  const env =
    process.env.NODE_ENV === "production"
      ? "production"
      : ((process.env.ATHYPER_ENV ?? "local") as
          | "local"
          | "staging"
          | "production");

  const raw = {
    env,
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
    shutdownTimeoutMs: process.env.SHUTDOWN_TIMEOUT_MS,
    credentialMasterKey: process.env.CREDENTIAL_MASTER_KEY,

    db: {
      url: process.env.DATABASE_URL,
      poolMax: process.env.DB_POOL_MAX,
    },
    redis: {
      url:                  process.env.REDIS_URL,
      bullmqUrl:            process.env.REDIS_BULLMQ_URL,
      connectTimeout:       process.env.REDIS_CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES,
      errorLogCooldownMs:   process.env.REDIS_ERROR_LOG_COOLDOWN_MS,
    },
    iam: {
      issuerUrl,
      realm: process.env.IAM_DEFAULT_REALM ?? process.env.KEYCLOAK_REALM,
      clientId:
        process.env.IAM_CLIENT_ID ?? process.env.KEYCLOAK_CLIENT_ID,
      clientSecret:
        process.env.IAM_CLIENT_SECRET ?? process.env.KEYCLOAK_CLIENT_SECRET,
    },
    outbox: {
      pollIntervalMs: process.env.OUTBOX_POLL_MS,
    },
    objectStorage: process.env.S3_ENDPOINT
      ? {
          endpoint: process.env.S3_ENDPOINT,
          // APP_S3_ACCESS_KEY is the scoped athyper-app MinIO user (I-11).
          // Falls back to S3_ACCESS_KEY (root) in local dev where both are equal.
          accessKey: process.env.APP_S3_ACCESS_KEY ?? process.env.S3_ACCESS_KEY,
          secretKey: process.env.APP_S3_SECRET_KEY ?? process.env.S3_SECRET_KEY,
          region:              process.env.S3_REGION,
          bucket:              process.env.S3_BUCKET,
          useSSL:              process.env.S3_USE_SSL,
          multipartPartSizeMb: process.env.S3_MULTIPART_PART_SIZE_MB,
          multipartQueueSize:  process.env.S3_MULTIPART_QUEUE_SIZE,
          maxUploadMb:         process.env.S3_MAX_UPLOAD_MB,
          presignedTtlSeconds: process.env.S3_PRESIGNED_TTL_SECONDS,
        }
      : undefined,

    email: process.env.SMTP_HOST
      ? {
          host:         process.env.SMTP_HOST,
          port:         process.env.SMTP_PORT,
          secure:       process.env.SMTP_SECURE,
          user:         process.env.SMTP_USER,
          pass:         process.env.SMTP_PASS,
          from_address: process.env.SMTP_FROM ?? "",
        }
      : undefined,

    sms: process.env.TWILIO_ACCOUNT_SID
      ? {
          accountSid:          process.env.TWILIO_ACCOUNT_SID,
          authToken:           process.env.TWILIO_AUTH_TOKEN,
          fromNumber:          process.env.TWILIO_FROM_NUMBER ?? "",
          messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
        }
      : undefined,

    push: (process.env.PUSH_FCM_PROJECT_ID ?? process.env.VAPID_PUBLIC_KEY)
      ? {
          fcmProjectId:            process.env.PUSH_FCM_PROJECT_ID,
          fcmServiceAccountKeyJson: process.env.PUSH_FCM_SERVICE_ACCOUNT_KEY,
          vapidSubject:            process.env.VAPID_SUBJECT,
          vapidPublicKey:          process.env.VAPID_PUBLIC_KEY,
          vapidPrivateKey:         process.env.VAPID_PRIVATE_KEY,
        }
      : undefined,

    clamd: process.env.CLAMD_HOST
      ? {
          host:          process.env.CLAMD_HOST,
          port:          process.env.CLAMD_PORT,
          timeoutMs:     process.env.CLAMD_TIMEOUT_MS,
          onUnavailable: process.env.CLAMD_ON_UNAVAILABLE,
        }
      : undefined,

    sentry: process.env.GLITCHTIP_DSN
      ? {
          dsn:              process.env.GLITCHTIP_DSN,
          tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
        }
      : undefined,

    healthchecks: process.env.HEALTHCHECKS_BASE_URL
      ? {
          baseUrl: process.env.HEALTHCHECKS_BASE_URL,
        }
      : undefined,

    gotenberg: process.env.GOTENBERG_BASE_URL
      ? {
          baseUrl:   process.env.GOTENBERG_BASE_URL,
          timeoutMs: process.env.GOTENBERG_TIMEOUT_MS,
        }
      : undefined,

    meilisearch: process.env.MEILISEARCH_URL && process.env.MEILISEARCH_MASTER_KEY
      ? {
          url:       process.env.MEILISEARCH_URL,
          masterKey: process.env.MEILISEARCH_MASTER_KEY,
        }
      : undefined,

    platformControl: {
      enabled: process.env.PLATFORM_CONTROL_ENABLED,
      realmKey: process.env.PLATFORM_CONTROL_REALM_KEY,
    },
  };

  const result = ServerConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Server config invalid — check env vars:\n${issues}`);
  }

  // ─── Safety preflight: block dangerous dev-only settings in non-local envs ──
  if (result.data.env !== "local") {
    const violations: string[] = [];

    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      violations.push(
        "NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate verification — remove from non-local env"
      );
    }

    if (
      process.env.AUTH_DEBUG_EXPOSE_TOKENS === "true" ||
      process.env.AUTH_DEBUG_EXPOSE_TOKENS === "1"
    ) {
      violations.push(
        "AUTH_DEBUG_EXPOSE_TOKENS=true exposes auth tokens in logs — remove from non-local env"
      );
    }

    if (result.data.clamd?.onUnavailable === "fail-open") {
      violations.push(
        "CLAMD_ON_UNAVAILABLE=fail-open lets attachment uploads bypass virus scanning when clamd is down — set CLAMD_ON_UNAVAILABLE=fail-closed in non-local env"
      );
    }

    if (violations.length > 0) {
      throw new Error(
        `FATAL: Unsafe configuration detected for env="${result.data.env}":\n` +
          violations.map((v) => `  • ${v}`).join("\n")
      );
    }
  }

  return result.data;
}
