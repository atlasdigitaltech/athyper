// framework/runtime/kernel/config.schema.ts
import { z } from "zod";

export const RuntimeModeSchema = z.enum(["api", "worker", "scheduler"]);
export type RuntimeMode = z.infer<typeof RuntimeModeSchema>;

/**
 * Safe boolean coercion:
 * - supports true/false, 1/0, yes/no, on/off
 * - avoids JS Boolean("false") === true pitfall
 */
const Bool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;

  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }

  return v;
}, z.boolean());

/**
 * We intentionally allow "defaults" to be a free-form JSON object.
 * This powers the cascade:
 * realm.defaults -> tenant.defaults -> org.defaults
 */
const DefaultsSchema = z.record(z.any()).default({});

const OrgConfigSchema = z.object({
  defaults: DefaultsSchema,
});

const TenantConfigSchema = z.object({
  defaults: DefaultsSchema,
  orgs: z.record(OrgConfigSchema).default({}),
});

const RealmConfigSchema = z.object({
  /**
   * Realm-level defaults (feature flags, policies, etc.)
   */
  defaults: DefaultsSchema,

  /**
   * IAM config for this realm.
   * Secrets should not be stored in JSON. Use clientSecretRef and resolve via SUPERSTAR env.
   */
  iam: z.object({
    issuerUrl: z.string().url(),
    clientId: z.string().min(1),
    /** Authorized party (azp) allowlist — tokens must come from one of these clients. */
    allowedAzp: z.array(z.string().min(1)).optional(),
    clientSecretRef: z.string().min(1).optional(),
  }),

  /**
   * Redirect URI allowlist for this realm.
   * In production, no wildcards are permitted.
   */
  redirectUriAllowlist: z.array(z.string()).default([]),

  /**
   * Auth feature flags for gradual rollout.
   */
  featureFlags: z
    .object({
      /** Enable Redis-backed BFF sessions (vs. cookie-only). */
      bffSessions: Bool.default(false),
      /** Enable refresh token rotation on every use. */
      refreshRotation: Bool.default(false),
      /** Enable CSRF double-submit enforcement. */
      csrfProtection: Bool.default(false),
      /** Enable strict JWT issuer validation at API boundary. */
      strictIssuerCheck: Bool.default(false),
      /** Enable PKCE authorization code flow (vs. direct grant). */
      pkceFlow: Bool.default(false),
    })
    .default({}),

  /**
   * Platform-level IAM security minimums.
   * Tenants cannot configure values weaker than these.
   */
  platformMinimums: z
    .object({
      passwordMinLength: z.coerce.number().int().min(1).default(8),
      passwordHistory: z.coerce.number().int().min(0).default(1),
      maxLoginFailures: z.coerce.number().int().min(1).default(10),
      lockoutDurationMinutes: z.coerce.number().int().min(1).default(5),
    })
    .default({}),

  tenants: z.record(TenantConfigSchema).default({}),
});

export const RuntimeConfigSchema = z.object({
  env: z.enum(["local", "staging", "production"]).default("local"),
  mode: RuntimeModeSchema.default("api"),
  serviceName: z.string().min(1).default("athyper-runtime"),
  port: z.coerce.number().int().positive().default(3000),

  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  shutdownTimeoutMs: z.coerce.number().int().positive().default(15_000),

  publicBaseUrl: z.string().url().optional(),
  publicWebUrl: z.string().url().optional(),

  db: z.object({
    url: z.string().min(1), // PgBouncer
    adminUrl: z.string().min(1).optional(), // Direct Postgres
    poolMax: z.coerce.number().int().positive().default(10),
  }),

  /**
   * IAM at runtime is resolved per realmKey+tenantKey+orgKey.
   */
  iam: z.object({
    strategy: z.enum(["single_realm", "multi_realm"]).default("single_realm"),

    defaultRealmKey: z.string().min(1).default("athyper"),
    defaultTenantKey: z.string().min(1).optional(),
    defaultOrgKey: z.string().min(1).optional(),

    /**
     * Realms registry.
     * - single_realm: typically only one entry (e.g., "main"), but you may still keep multiple for future.
     * - multi_realm: multiple entries (per customer/realm).
     */
    requireTenantClaimsInProd: Bool.default(true),
    realms: z.record(RealmConfigSchema).default({}),
  }),

  /**
   * Platform-control realm configuration.
   * Enables athyper product admins to log in via a dedicated realm and
   * switch into any tenant's context for read-only support/management.
   */
  platformControl: z
    .object({
      /** Whether the platform-control realm is enabled. */
      enabled: Bool.default(false),
      /** The realmKey in iam.realms that corresponds to the platform-control realm. */
      realmKey: z.string().min(1).default("platform-control"),
      /** Keycloak realm roles recognised from the platform-control realm. */
      roles: z
        .object({
          productAdmin: z.string().default("PRODUCT_ADMIN"),
          tenantManager: z.string().default("TENANT_MANAGER"),
          supportAdmin: z.string().default("SUPPORT_ADMIN"),
          readOnlySupport: z.string().default("READ_ONLY_SUPPORT"),
        })
        .default({}),
      /** Redis key namespace for platform admin sessions. */
      sessionNamespace: z.string().default("platform"),
      /** Allowed operations per platform role. */
      rolePermissions: z.record(z.array(z.string())).default({
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
    .default({}),

  redis: z.object({ url: z.string().min(1) }),

  jobQueue: z
    .object({
      /** BullMQ queue name (all job types share one queue, differentiated by data.type) */
      queueName: z.string().min(1).default("athyper-jobs"),
      /** Default retry attempts for failed jobs */
      defaultRetries: z.coerce.number().int().min(0).default(3),
    })
    .default({}),

  s3: z.object({
    endpoint: z.string().min(1),
    accessKey: z.string().min(1),
    secretKey: z.string().min(1),
    region: z.string().min(1).default("us-east-1"),
    bucket: z.string().min(1).default("athyper"),
    useSSL: Bool.default(false),
  }),

  telemetry: z.object({
    otlpEndpoint: z.string().min(1).optional(),
    enabled: Bool.default(true),
    serviceName: z.string().min(1).default("athyper-runtime"),
    serviceVersion: z.string().min(1).default("1.0.0"),
  }),

  document: z
    .object({
      enabled: Bool.default(false),
      rendering: z
        .object({
          engine: z.enum(["puppeteer", "playwright"]).default("puppeteer"),
          chromiumPath: z.string().optional(),
          concurrency: z.coerce.number().int().min(1).max(10).default(3),
          timeoutMs: z.coerce.number().int().positive().default(30000),
          maxRetries: z.coerce.number().int().min(0).default(3),
          paperFormat: z.enum(["A4", "LETTER", "LEGAL"]).default("A4"),
          trustedDomains: z.array(z.string()).default([]),
          allowedHosts: z.array(z.string()).default([]),
          composeTimeoutMs: z.coerce.number().int().positive().default(5000),
          uploadTimeoutMs: z.coerce.number().int().positive().default(30000),
        })
        .default({}),
      storage: z
        .object({
          pathPrefix: z.string().default("documents"),
          presignedUrlExpirySeconds: z.coerce
            .number()
            .int()
            .positive()
            .default(3600),
          downloadMode: z.enum(["stream", "presigned"]).default("stream"),
        })
        .default({}),
      jobs: z
        .object({
          leaseSeconds: z.coerce.number().int().positive().default(300),
          heartbeatSeconds: z.coerce.number().int().positive().default(30),
        })
        .default({}),
      retention: z
        .object({
          defaultDays: z.coerce.number().int().positive().default(2555),
          archiveAfterDays: z.coerce.number().int().positive().default(365),
        })
        .default({}),
    })
    .default({}),

  audit: z
    .object({
      /** Audit write mode: off (drop events), sync (direct write), outbox (async via outbox) */
      writeMode: z.enum(["off", "sync", "outbox"]).default("outbox"),
      /** Enable SHA-256 hash chain tamper evidence */
      hashChainEnabled: Bool.default(true),
      /** Enable unified activity timeline service */
      timelineEnabled: Bool.default(true),
      /** Retention period in days */
      retentionDays: z.coerce.number().int().positive().default(90),
      /** Number of months to pre-create partitions ahead */
      partitionPreCreateMonths: z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .default(3),
      /** Enable column-level encryption for sensitive fields */
      encryptionEnabled: Bool.default(false),
      /** Enable load shedding policy evaluation */
      loadSheddingEnabled: Bool.default(false),
      /** Enable storage tiering (hot/warm/cold) */
      tieringEnabled: Bool.default(false),
      /** Days before data transitions from hot to warm tier */
      warmAfterDays: z.coerce.number().int().positive().default(90),
      /** Days before data transitions from warm to cold tier */
      coldAfterDays: z.coerce.number().int().positive().default(365),
    })
    .default({}),

  notification: z
    .object({
      enabled: Bool.default(true),
      providers: z
        .object({
          email: z
            .object({
              sendgrid: z
                .object({
                  apiKeyRef: z.string().optional(),
                  fromAddress: z.string().optional(),
                  fromName: z.string().optional(),
                  enabled: Bool.default(false),
                })
                .default({}),
            })
            .default({}),
          teams: z
            .object({
              powerAutomate: z
                .object({
                  webhookUrl: z.string().optional(),
                  enabled: Bool.default(false),
                })
                .default({}),
            })
            .default({}),
          whatsapp: z
            .object({
              phoneNumberId: z.string().optional(),
              accessTokenRef: z.string().optional(),
              businessAccountId: z.string().optional(),
              webhookVerifyToken: z.string().optional(),
              enabled: Bool.default(false),
            })
            .default({}),
          sms: z
            .object({
              twilio: z
                .object({
                  accountSidRef: z.string().optional(),
                  authTokenRef: z.string().optional(),
                  fromNumber: z.string().optional(),
                  enabled: Bool.default(false),
                })
                .default({}),
            })
            .default({}),
          push: z
            .object({
              vapidPublicKey: z.string().optional(),
              vapidPrivateKeyRef: z.string().optional(),
              vapidSubject: z.string().optional(),
              enabled: Bool.default(false),
            })
            .default({}),
        })
        .default({}),
      delivery: z
        .object({
          maxRetries: z.coerce.number().int().min(0).default(3),
          retryBackoffMs: z.coerce.number().int().positive().default(2000),
          dedupWindowMs: z.coerce.number().int().positive().default(300000),
          defaultPriority: z
            .enum(["low", "normal", "high", "critical"])
            .default("normal"),
          defaultLocale: z.string().min(2).default("en"),
          workerConcurrency: z.coerce.number().int().positive().default(5),
        })
        .default({}),
      digest: z
        .object({
          hourlyAt: z.coerce.number().int().min(0).max(59).default(0),
          dailyAtHourUtc: z.coerce.number().int().min(0).max(23).default(8),
          weeklyDay: z.coerce.number().int().min(0).max(6).default(1),
          maxItemsPerDigest: z.coerce.number().int().positive().default(50),
        })
        .default({}),
      retention: z
        .object({
          messageDays: z.coerce.number().int().positive().default(90),
          deliveryDays: z.coerce.number().int().positive().default(30),
        })
        .default({}),
    })
    .default({}),

  collab: z
    .object({
      enabled: Bool.default(true),
      maxCommentLength: z.coerce
        .number()
        .int()
        .min(100)
        .max(10000)
        .default(5000),
      maxThreadDepth: z.coerce.number().int().min(0).max(10).default(5),
      mentionsEnabled: Bool.default(true),
      attachmentsEnabled: Bool.default(true),
      timelineEnabled: Bool.default(true),
      rateLimits: z
        .object({
          commentsPerMinute: z.coerce.number().int().positive().default(10),
          mentionsPerComment: z.coerce.number().int().positive().default(20),
        })
        .default({}),
    })
    .default({}),

  eventStore: z
    .object({
      hotRetentionDays: z.coerce.number().int().positive().default(90),
      warmRetentionDays: z.coerce.number().int().positive().default(730),
      coldRetentionYears: z.coerce.number().int().positive().default(7),
      snapshotInterval: z.coerce.number().int().positive().default(1000),
      crossPartitionStalenessMs: z.coerce
        .number()
        .int()
        .positive()
        .default(5000),
      enableHashChain: Bool.default(true),
      enablePiiEncryption: Bool.default(true),
    })
    .default({}),

  financeEngines: z
    .object({
      enabled: Bool.default(false),
      decisionGrid: z
        .object({
          zeroApprovalEnabled: Bool.default(false),
          maxPipelineSteps: z.coerce.number().int().positive().default(12),
          pipelineTimeoutMs: z.coerce.number().int().positive().default(60000),
          compositeScoring: z
            .object({
              zeroApprovalThreshold: z.coerce
                .number()
                .min(0)
                .max(1)
                .default(0.9),
              standardThreshold: z.coerce.number().min(0).max(1).default(0.75),
              enhancedThreshold: z.coerce.number().min(0).max(1).default(0.5),
              executiveThreshold: z.coerce.number().min(0).max(1).default(0.25),
            })
            .default({}),
        })
        .default({}),
      budget: z
        .object({
          reserveExpiryMinutes: z.coerce
            .number()
            .int()
            .positive()
            .default(1440),
          healthThresholds: z
            .object({
              yellowPct: z.coerce.number().min(0).max(100).default(75),
              redPct: z.coerce.number().min(0).max(100).default(90),
              blackPct: z.coerce.number().min(0).max(100).default(100),
            })
            .default({}),
          reforecastEnabled: Bool.default(false),
        })
        .default({}),
      commitment: z
        .object({
          autoRenewalEnabled: Bool.default(true),
          renewalNoticeBeforeDays: z.coerce
            .number()
            .int()
            .positive()
            .default(30),
          maxScheduleEntries: z.coerce.number().int().positive().default(120),
        })
        .default({}),
      posting: z
        .object({
          autoAccrualEnabled: Bool.default(false),
          reconciliationSchedule: z.string().default("0 2 * * *"),
        })
        .default({}),
      tax: z
        .object({
          treatyResolutionEnabled: Bool.default(true),
          reverseChargeEnabled: Bool.default(true),
        })
        .default({}),
      asset: z
        .object({
          depreciationSchedule: z.string().default("0 1 1 * *"),
          revaluationEnabled: Bool.default(false),
        })
        .default({}),
      inventory: z
        .object({
          reorderCheckSchedule: z.string().default("0 6 * * *"),
          valuationRecalcSchedule: z.string().default("0 3 1 * *"),
        })
        .default({}),
      commission: z
        .object({
          accrualSchedule: z.string().default("0 2 1 * *"),
          settlementSchedule: z.string().default("0 4 15 * *"),
          clawbackCheckDays: z.coerce.number().int().min(0).default(90),
        })
        .default({}),
      federation: z
        .object({
          fxRevaluationSchedule: z.string().default("0 1 1 * *"),
          nettingEnabled: Bool.default(true),
          nettingSchedule: z.string().default("0 3 * * 5"),
        })
        .default({}),
      production: z
        .object({
          overheadAbsorptionSchedule: z.string().default("0 2 1 * *"),
          varianceAnalysisOnClose: Bool.default(true),
        })
        .default({}),
      atlasAi: z
        .object({
          enabled: Bool.default(false),
          autonomousConfidenceThreshold: z.coerce
            .number()
            .min(0)
            .max(1)
            .default(0.95),
          defaultReversalWindowMinutes: z.coerce
            .number()
            .int()
            .positive()
            .default(60),
          driftMonitoringSchedule: z.string().default("0 4 * * *"),
        })
        .default({}),
    })
    .default({}),

  voice: z
    .object({
      enabled: Bool.default(false),
      providers: z
        .object({
          twilio: z
            .object({
              accountSidRef: z.string().optional(),
              authTokenRef: z.string().optional(),
              fromNumber: z.string().optional(),
              webhookSigningSecretRef: z.string().optional(),
              enabled: Bool.default(false),
            })
            .default({}),
          webrtc: z
            .object({
              enabled: Bool.default(false),
              stunServers: z.array(z.string()).default([]),
              turnServerUrl: z.string().optional(),
              turnCredentialRef: z.string().optional(),
            })
            .default({}),
        })
        .default({}),
      recording: z
        .object({
          autoStore: Bool.default(false),
          storagePrefix: z.string().default("recordings"),
          retentionDays: z.coerce.number().int().positive().default(365),
        })
        .default({}),
      analytics: z
        .object({
          aggregationCron: z.string().default("0 2 * * *"),
        })
        .default({}),
    })
    .default({}),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
