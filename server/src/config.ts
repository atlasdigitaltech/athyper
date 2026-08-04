// server/src/config.ts
//
// Zod-validated server configuration.
// Reads from process.env (after dotenv) and fails fast at startup
// with a clear error message if any required value is missing or invalid.
//
// Env var naming supports both Docker stack (IAM_*, DB_*) and local dev
// (KEYCLOAK_*, DATABASE_URL) conventions — same as before, now validated.

import { z } from "zod";

const ATLAS_TOOL_RECOVERY_SAFETY_MARGIN_MS = 60_000;

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

const OptionalNonEmptyString = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, z.string().optional());

const OptionalCredentialMasterKey = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, z.string().min(32, "CREDENTIAL_MASTER_KEY must be at least 32 characters").optional());

const OptionalAtlasCredentialFingerprintKey = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, z.string()
  .min(32, "ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY must be at least 32 characters")
  .optional());

const OptionalOpenAiProjectId = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const projectId = v.trim();
  return projectId === "" ? undefined : projectId;
}, z.string()
  .min(1)
  .max(200, "OPENAI_PROJECT_ID must be at most 200 characters")
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "OPENAI_PROJECT_ID may contain only letters, numbers, dots, underscores, and hyphens",
  )
  .optional());

const OptionalGeminiProjectId = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const projectId = v.trim();
  return projectId === "" ? undefined : projectId;
}, z.string()
  .min(1)
  .max(200, "GEMINI_PROJECT_ID must be at most 200 characters")
  .regex(
    /^[A-Za-z0-9._:-]+$/,
    "GEMINI_PROJECT_ID may contain only letters, numbers, dots, underscores, colons, and hyphens",
  )
  .optional());

// Atlas prices and capability claims are reviewed against exact upstream
// snapshots. Do not accept an arbitrary model id through environment
// configuration: a new snapshot must first be added to the reviewed model
// profile registry in @athyper/svc-ai.
const AtlasAnthropicFastModelId = z.literal("claude-haiku-4-5-20251001");
const AtlasAnthropicBalancedModelId = z.literal("claude-sonnet-4-6");
const AtlasAnthropicBestModelId = z.literal("claude-opus-4-8");
const AtlasOpenAiEvalModelId = z.literal("gpt-5.6-sol");
const AtlasGeminiEvalModelId = z.literal("gemini-3.6-flash");

const AtlasAgentConfigSchema = z
  .object({
    enabled: Bool.default(false),
    credentialFingerprintKey: OptionalAtlasCredentialFingerprintKey,
    defaultPublicModelId: z
      .enum(["atlas-fast", "atlas-balanced", "atlas-best"])
      .default("atlas-fast"),
    providerTimeoutMs: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
    streamIdleTimeoutMs: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    maxOutputTokens: z.coerce.number().int().min(1).max(8_192).default(2_048),
    maxOutputBytes: z.coerce.number().int().min(1_024).max(4_194_304).default(131_072),
    userRunsPerMinute: z.coerce.number().int().min(1).max(10_000).default(10),
    tenantRunsPerMinute: z.coerce.number().int().min(1).max(100_000).default(100),
    tools: z
      .object({
        enabled: Bool.default(false),
        maxRounds: z.coerce.number().int().min(1).max(8).default(3),
        maxCalls: z.coerce.number().int().min(1).max(16).default(4),
        maxElapsedMs: z.coerce.number().int().min(5_000).max(600_000).default(120_000),
        maxTotalTokens: z.coerce.number().int().min(1_024).max(1_000_000).default(32_768),
        timeoutMs: z.coerce.number().int().min(100).max(60_000).default(10_000),
        maxInputBytes: z.coerce.number().int().min(512).max(1_048_576).default(32_768),
        maxResultBytes: z.coerce.number().int().min(512).max(1_048_576).default(32_768),
      })
      .default({
        enabled: false,
        maxRounds: 3,
        maxCalls: 4,
        maxElapsedMs: 120_000,
        maxTotalTokens: 32_768,
        timeoutMs: 10_000,
        maxInputBytes: 32_768,
        maxResultBytes: 32_768,
      }),
    persistence: z
      .object({
        enabled: Bool.default(false),
        maintenanceDatabaseUrl: OptionalNonEmptyString,
        contentProtectionMode: z
          .enum([
            "database_at_rest_non_sensitive_only",
            "tenant_protected_store",
          ])
          .default("database_at_rest_non_sensitive_only"),
        defaultRetentionDays: z.coerce.number().int().min(1).max(3_650).default(30),
        minimumRetentionDays: z.coerce.number().int().min(1).max(3_650).default(1),
        maximumRetentionDays: z.coerce.number().int().min(1).max(3_650).default(365),
        contextMaxMessages: z.coerce.number().int().min(1).max(200).default(20),
        contextMaxCharacters: z.coerce.number().int().min(4_096).max(1_048_576).default(98_304),
        staleRunTimeoutMs: z.coerce.number().int().min(60_000).max(86_400_000).default(900_000),
        purgeBatchSize: z.coerce.number().int().min(1).max(1_000).default(500),
      })
      .superRefine((value, ctx) => {
        if (value.minimumRetentionDays > value.maximumRetentionDays) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["minimumRetentionDays"],
            message:
              "ATLAS_CONVERSATION_MIN_RETENTION_DAYS cannot exceed ATLAS_CONVERSATION_MAX_RETENTION_DAYS",
          });
        }
        if (
          value.defaultRetentionDays < value.minimumRetentionDays
          || value.defaultRetentionDays > value.maximumRetentionDays
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["defaultRetentionDays"],
            message:
              "ATLAS_CONVERSATION_RETENTION_DAYS must be within the configured retention bounds",
          });
        }
      })
      .default({
        enabled: false,
        contentProtectionMode: "database_at_rest_non_sensitive_only",
        defaultRetentionDays: 30,
        minimumRetentionDays: 1,
        maximumRetentionDays: 365,
        contextMaxMessages: 20,
        contextMaxCharacters: 98_304,
        staleRunTimeoutMs: 900_000,
        purgeBatchSize: 500,
      }),
    anthropic: z
      .object({
        fastModelId: AtlasAnthropicFastModelId.default("claude-haiku-4-5-20251001"),
        balancedModelId: AtlasAnthropicBalancedModelId.default("claude-sonnet-4-6"),
        bestModelId: AtlasAnthropicBestModelId.default("claude-opus-4-8"),
      })
      .default({
        fastModelId: "claude-haiku-4-5-20251001",
        balancedModelId: "claude-sonnet-4-6",
        bestModelId: "claude-opus-4-8",
      }),
    openai: z
      .object({
        enabled: Bool.default(false),
        evalModelId: AtlasOpenAiEvalModelId.default("gpt-5.6-sol"),
        projectId: OptionalOpenAiProjectId,
        timeoutMs: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
      })
      .default({
        enabled: false,
        evalModelId: "gpt-5.6-sol",
        timeoutMs: 60_000,
      }),
    gemini: z
      .object({
        enabled: Bool.default(false),
        evalModelId: AtlasGeminiEvalModelId.default("gemini-3.6-flash"),
        projectId: OptionalGeminiProjectId,
        providerRegion: z.literal("global").optional(),
        accountClass: z.enum(["free", "paid"]).optional(),
        timeoutMs: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
      })
      .superRefine((value, ctx) => {
        if (!value.enabled) return;
        if (!value.projectId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["projectId"],
            message: "GEMINI_PROJECT_ID is required when GEMINI_PROVIDER_ENABLED=true",
          });
        }
        if (!value.providerRegion) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["providerRegion"],
            message:
              "GEMINI_PROVIDER_REGION is required when GEMINI_PROVIDER_ENABLED=true",
          });
        }
        if (!value.accountClass) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["accountClass"],
            message:
              "GEMINI_ACCOUNT_CLASS is required when GEMINI_PROVIDER_ENABLED=true",
          });
        }
      })
      .default({
        enabled: false,
        evalModelId: "gemini-3.6-flash",
        timeoutMs: 60_000,
      }),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && !value.credentialFingerprintKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["credentialFingerprintKey"],
        message:
          "ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY is required when ATLAS_AGENT_ENABLED=true",
      });
    }
    if (value.streamIdleTimeoutMs > value.providerTimeoutMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["streamIdleTimeoutMs"],
        message: "ATLAS_AGENT_STREAM_IDLE_TIMEOUT_MS cannot exceed ATLAS_AGENT_PROVIDER_TIMEOUT_MS",
      });
    }
    if (
      value.persistence.enabled
      && value.persistence.staleRunTimeoutMs <= value.providerTimeoutMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["persistence", "staleRunTimeoutMs"],
        message:
          "ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS must exceed ATLAS_AGENT_PROVIDER_TIMEOUT_MS",
      });
    }
    if (value.tools.enabled && !value.persistence.enabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tools", "enabled"],
        message:
          "ATLAS_AGENT_TOOLS_ENABLED requires ATLAS_CONVERSATION_PERSISTENCE_ENABLED=true",
      });
    }
    if (
      value.tools.enabled
      && value.persistence.staleRunTimeoutMs
        <= value.tools.maxElapsedMs + ATLAS_TOOL_RECOVERY_SAFETY_MARGIN_MS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["persistence", "staleRunTimeoutMs"],
        message:
          "ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS must exceed ATLAS_AGENT_TOOL_MAX_ELAPSED_MS by more than 60000ms",
      });
    }
    if (value.tools.timeoutMs > value.tools.maxElapsedMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tools", "timeoutMs"],
        message:
          "ATLAS_AGENT_TOOL_TIMEOUT_MS cannot exceed ATLAS_AGENT_TOOL_MAX_ELAPSED_MS",
      });
    }
    if (value.tenantRunsPerMinute < value.userRunsPerMinute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tenantRunsPerMinute"],
        message: "ATLAS_AGENT_TENANT_RUNS_PER_MINUTE cannot be lower than the per-user limit",
      });
    }
  });

const PushConfigSchema = z
  .object({
    fcmProjectId:            OptionalNonEmptyString,
    fcmServiceAccountKeyJson: OptionalNonEmptyString,
    vapidSubject:            OptionalNonEmptyString,
    vapidPublicKey:          OptionalNonEmptyString,
    vapidPrivateKey:         OptionalNonEmptyString,
  })
  .superRefine((value, ctx) => {
    const hasFcm = Boolean(value.fcmProjectId || value.fcmServiceAccountKeyJson);
    if (hasFcm) {
      if (!value.fcmProjectId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fcmProjectId"], message: "PUSH_FCM_PROJECT_ID is required when FCM push is configured" });
      }
      if (!value.fcmServiceAccountKeyJson) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fcmServiceAccountKeyJson"], message: "PUSH_FCM_SERVICE_ACCOUNT_KEY is required when FCM push is configured" });
      }
    }

    const hasVapid = Boolean(value.vapidSubject || value.vapidPublicKey || value.vapidPrivateKey);
    if (!hasVapid) return;

    if (!value.vapidSubject) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vapidSubject"], message: "VAPID_SUBJECT is required when VAPID Web Push is configured" });
    } else if (!/^mailto:.+@.+|https:\/\/.+/i.test(value.vapidSubject)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vapidSubject"], message: "VAPID_SUBJECT must be a mailto: or https:// URI" });
    }

    if (!value.vapidPublicKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vapidPublicKey"], message: "VAPID_PUBLIC_KEY is required when VAPID Web Push is configured" });
    } else {
      try {
        const bytes = Buffer.from(value.vapidPublicKey, "base64url");
        if (bytes.length !== 65 || bytes[0] !== 0x04) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vapidPublicKey"], message: "VAPID_PUBLIC_KEY must be an uncompressed P-256 public key" });
        }
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vapidPublicKey"], message: "VAPID_PUBLIC_KEY must be base64url encoded" });
      }
    }

    if (!value.vapidPrivateKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vapidPrivateKey"], message: "VAPID_PRIVATE_KEY is required when VAPID Web Push is configured" });
    } else {
      try {
        const bytes = Buffer.from(value.vapidPrivateKey, "base64url");
        if (bytes.length !== 32) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vapidPrivateKey"], message: "VAPID_PRIVATE_KEY must be a raw P-256 private key" });
        }
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vapidPrivateKey"], message: "VAPID_PRIVATE_KEY must be base64url encoded" });
      }
    }
  });

// ─── Schema ──────────────────────────────────────────────────────────────────

const ServerConfigSchema = z.object({
  env: z.enum(["local", "staging", "production"]).default("local"),
  port: z.coerce.number().int().positive().default(4000),
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  shutdownTimeoutMs: z.coerce.number().int().positive().default(15_000),
  attachmentAuthStrict: Bool.default(false),
  attachmentMultipartCleanupStrict: Bool.default(false),
  atlasAgent: AtlasAgentConfigSchema.default({
    enabled: false,
    defaultPublicModelId: "atlas-fast",
    providerTimeoutMs: 60_000,
    streamIdleTimeoutMs: 30_000,
    maxOutputTokens: 2_048,
    maxOutputBytes: 131_072,
    userRunsPerMinute: 10,
    tenantRunsPerMinute: 100,
    tools: {
      enabled: false,
      maxRounds: 3,
      maxCalls: 4,
      maxElapsedMs: 120_000,
      maxTotalTokens: 32_768,
      timeoutMs: 10_000,
      maxInputBytes: 32_768,
      maxResultBytes: 32_768,
    },
    persistence: {
      enabled: false,
      contentProtectionMode: "database_at_rest_non_sensitive_only",
      defaultRetentionDays: 30,
      minimumRetentionDays: 1,
      maximumRetentionDays: 365,
      contextMaxMessages: 20,
      contextMaxCharacters: 98_304,
      staleRunTimeoutMs: 900_000,
      purgeBatchSize: 500,
    },
    anthropic: {
      fastModelId: "claude-haiku-4-5-20251001",
      balancedModelId: "claude-sonnet-4-6",
      bestModelId: "claude-opus-4-8",
    },
    openai: {
      enabled: false,
      evalModelId: "gpt-5.6-sol",
      timeoutMs: 60_000,
    },
    gemini: {
      enabled: false,
      evalModelId: "gemini-3.6-flash",
      timeoutMs: 60_000,
    },
  }),

  /**
   * Master key for AES-256-GCM field encryption (audit PII, integration
   * credentials). Must be ≥32 characters — shorter keys cannot yield the
   * 256-bit KEK that CredentialEncryptionService derives via PBKDF2.
   * Required in staging/production; optional in local dev (encryption is
   * disabled when absent).
   */
  credentialMasterKey: OptionalCredentialMasterKey,

  db: z.object({
    url: z.string().min(1, "DATABASE_URL is required"),
    poolMax: z.coerce.number().int().positive().default(5),
  }),

  platformDb: z.object({
    url: z.string().min(1),
    poolMax: z.coerce.number().int().positive().default(2),
  }).optional(),

  meshDb: z.object({
    url: z.string().min(1),
    poolMax: z.coerce.number().int().positive().default(2),
  }).optional(),

  redis: z.object({
    url: z.string().min(1, "REDIS_URL is required"),
    /**
     * Optional dedicated Redis URL for BullMQ (queues, workers, schedulers).
     * When unset, BullMQ reuses `url` but with its own connection options
     * (maxRetriesPerRequest: null). Set this to point BullMQ at a different
     * Redis server or db index (e.g. redis://host:6379/1) so a READONLY error
     * or reconnect storm on the cache client cannot cascade to job coordination.
     */
    bullmqUrl: OptionalNonEmptyString,
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
      host:                  z.string().min(1),
      port:                  z.coerce.number().int().positive().default(587),
      secure:                Bool.default(false),
      user:                  z.string().default(""),
      pass:                  z.string().default(""),
      from_address:          z.string().default(""),
      bounce_webhook_secret: z.string().optional(),
      from_neon:             z.string().optional(),
      from_mesh:             z.string().optional(),
      from_admin:            z.string().optional(),
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
  push: PushConfigSchema.optional(),

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
   * Optional — when CRONWATCH_BASE_URL is unset, hooks are no-ops.
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
  if (
    data.env !== "local"
    && data.atlasAgent.gemini.enabled
    && data.atlasAgent.gemini.accountClass === "free"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["atlasAgent", "gemini", "accountClass"],
      message:
        "GEMINI_ACCOUNT_CLASS=free is allowed only in the local development profile",
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

  // ATHYPER_ENV / ENVIRONMENT are authoritative (set by stack scripts and systemd).
  // NODE_ENV=production is a build-time signal and must not override them — a
  // staging container built with NODE_ENV=production would otherwise self-identify
  // as production and skip staging-specific config branches.
  const _rawEnv = process.env.ATHYPER_ENV ?? process.env.ENVIRONMENT;
  const env = ((["local", "staging", "production"] as const).includes(
    _rawEnv as never,
  )
    ? _rawEnv
    : process.env.NODE_ENV === "production"
    ? "production"
    : "local") as "local" | "staging" | "production";

  const meshDatabaseUrl =
    process.env.MESH_DB_URL
    ?? process.env.MESH_DATABASE_URL;
  const meshDatabasePoolMax = process.env.MESH_DB_POOL_MAX ?? process.env.MESH_DATABASE_POOL_MAX;
  const platformDatabaseUrl = process.env.ATHYPER_PLATFORM_DATABASE_URL;
  const platformDatabasePoolMax = process.env.ATHYPER_PLATFORM_DATABASE_POOL_MAX;

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
    platformDb: platformDatabaseUrl
      ? { url: platformDatabaseUrl, poolMax: platformDatabasePoolMax }
      : undefined,
    meshDb: meshDatabaseUrl
      ? { url: meshDatabaseUrl, poolMax: meshDatabasePoolMax }
      : undefined,
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
          host:                  process.env.SMTP_HOST,
          port:                  process.env.SMTP_PORT,
          secure:                process.env.SMTP_SECURE,
          user:                  process.env.SMTP_USER,
          pass:                  process.env.SMTP_PASS,
          from_address:          process.env.SMTP_FROM ?? "",
          bounce_webhook_secret: process.env.SMTP_BOUNCE_WEBHOOK_SECRET,
          from_neon:             process.env.SMTP_FROM_NEON,
          from_mesh:             process.env.SMTP_FROM_MESH,
          from_admin:            process.env.SMTP_FROM_ADMIN,
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

    push: (
      process.env.PUSH_FCM_PROJECT_ID
      ?? process.env.PUSH_FCM_SERVICE_ACCOUNT_KEY
      ?? process.env.VAPID_SUBJECT
      ?? process.env.VAPID_PUBLIC_KEY
      ?? process.env.VAPID_PRIVATE_KEY
    )
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

    healthchecks: process.env.CRONWATCH_BASE_URL
      ? {
          baseUrl: process.env.CRONWATCH_BASE_URL,
        }
      : undefined,

    gotenberg: process.env.DOCRENDER_BASE_URL
      ? {
          baseUrl:   process.env.DOCRENDER_BASE_URL,
          timeoutMs: process.env.DOCRENDER_TIMEOUT_MS,
        }
      : undefined,

    meilisearch: process.env.SEARCHCORE_URL && process.env.SEARCHCORE_MASTER_KEY
      ? {
          url:       process.env.SEARCHCORE_URL,
          masterKey: process.env.SEARCHCORE_MASTER_KEY,
        }
      : undefined,

    platformControl: {
      enabled: process.env.PLATFORM_CONTROL_ENABLED,
      realmKey: process.env.PLATFORM_CONTROL_REALM_KEY,
    },
    attachmentAuthStrict: process.env.ATTACHMENT_AUTH_STRICT,
    attachmentMultipartCleanupStrict: process.env.ATTACHMENT_MULTIPART_CLEANUP_STRICT,
    atlasAgent: {
      enabled: process.env.ATLAS_AGENT_ENABLED,
      credentialFingerprintKey:
        process.env.ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY,
      defaultPublicModelId: process.env.ATLAS_AGENT_DEFAULT_PUBLIC_MODEL,
      providerTimeoutMs: process.env.ATLAS_AGENT_PROVIDER_TIMEOUT_MS,
      streamIdleTimeoutMs: process.env.ATLAS_AGENT_STREAM_IDLE_TIMEOUT_MS,
      maxOutputTokens: process.env.ATLAS_AGENT_MAX_OUTPUT_TOKENS,
      maxOutputBytes: process.env.ATLAS_AGENT_MAX_OUTPUT_BYTES,
      userRunsPerMinute: process.env.ATLAS_AGENT_USER_RUNS_PER_MINUTE,
      tenantRunsPerMinute: process.env.ATLAS_AGENT_TENANT_RUNS_PER_MINUTE,
      tools: {
        enabled: process.env.ATLAS_AGENT_TOOLS_ENABLED,
        maxRounds: process.env.ATLAS_AGENT_TOOL_MAX_ROUNDS,
        maxCalls: process.env.ATLAS_AGENT_TOOL_MAX_CALLS,
        maxElapsedMs: process.env.ATLAS_AGENT_TOOL_MAX_ELAPSED_MS,
        maxTotalTokens: process.env.ATLAS_AGENT_TOOL_MAX_TOTAL_TOKENS,
        timeoutMs: process.env.ATLAS_AGENT_TOOL_TIMEOUT_MS,
        maxInputBytes: process.env.ATLAS_AGENT_TOOL_MAX_INPUT_BYTES,
        maxResultBytes: process.env.ATLAS_AGENT_TOOL_MAX_RESULT_BYTES,
      },
      persistence: {
        enabled: process.env.ATLAS_CONVERSATION_PERSISTENCE_ENABLED,
        maintenanceDatabaseUrl:
          process.env.ATLAS_CONVERSATION_MAINTENANCE_DATABASE_URL,
        contentProtectionMode:
          process.env.ATLAS_CONVERSATION_CONTENT_PROTECTION_MODE,
        defaultRetentionDays: process.env.ATLAS_CONVERSATION_RETENTION_DAYS,
        minimumRetentionDays:
          process.env.ATLAS_CONVERSATION_MIN_RETENTION_DAYS,
        maximumRetentionDays:
          process.env.ATLAS_CONVERSATION_MAX_RETENTION_DAYS,
        contextMaxMessages:
          process.env.ATLAS_CONVERSATION_CONTEXT_MAX_MESSAGES,
        contextMaxCharacters:
          process.env.ATLAS_CONVERSATION_CONTEXT_MAX_CHARACTERS,
        staleRunTimeoutMs:
          process.env.ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS,
        purgeBatchSize: process.env.ATLAS_CONVERSATION_PURGE_BATCH_SIZE,
      },
      anthropic: {
        fastModelId: process.env.ATLAS_AGENT_ANTHROPIC_FAST_MODEL,
        balancedModelId: process.env.ATLAS_AGENT_ANTHROPIC_BALANCED_MODEL,
        bestModelId: process.env.ATLAS_AGENT_ANTHROPIC_BEST_MODEL,
      },
      openai: {
        enabled: process.env.OPENAI_PROVIDER_ENABLED,
        evalModelId: process.env.ATLAS_AGENT_OPENAI_EVAL_MODEL,
        projectId: process.env.OPENAI_PROJECT_ID,
        timeoutMs: process.env.OPENAI_TIMEOUT_MS,
      },
      gemini: {
        enabled: process.env.GEMINI_PROVIDER_ENABLED,
        evalModelId: process.env.GEMINI_EVAL_MODEL,
        projectId: process.env.GEMINI_PROJECT_ID,
        providerRegion: process.env.GEMINI_PROVIDER_REGION,
        accountClass: process.env.GEMINI_ACCOUNT_CLASS,
        timeoutMs: process.env.GEMINI_TIMEOUT_MS,
      },
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
        "NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate verification - remove from non-local env"
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
