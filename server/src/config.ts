// server/src/config.ts
//
// Zod-validated server configuration.
// Reads from process.env (after dotenv) and fails fast at startup
// with a clear error message if any required value is missing or invalid.
//
// Env var naming supports both Docker mesh (IAM_*, DB_*) and local dev
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

  db: z.object({
    url: z.string().min(1, "DATABASE_URL is required"),
    poolMax: z.coerce.number().int().positive().default(5),
  }),

  redis: z.object({
    url: z.string().min(1, "REDIS_URL is required"),
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
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load and validate server config from process.env.
 * Throws with a clear human-readable error if any required value is missing
 * or malformed — intended to be called once at startup before adapter creation.
 */
export function loadConfig(): ServerConfig {
  // IAM issuer URL — support Docker mesh (IAM_ISSUER_URL) and local dev
  // (KEYCLOAK_BASE_URL + KEYCLOAK_REALM) naming conventions
  const issuerUrl =
    process.env.IAM_ISSUER_URL ??
    (() => {
      const base =
        process.env.KEYCLOAK_BASE_URL ?? "https://iam.mesh.athyper.local";
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

    db: {
      url: process.env.DATABASE_URL,
      poolMax: process.env.DB_POOL_MAX,
    },
    redis: {
      url:                  process.env.REDIS_URL,
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
          endpoint:            process.env.S3_ENDPOINT,
          accessKey:           process.env.S3_ACCESS_KEY,
          secretKey:           process.env.S3_SECRET_KEY,
          region:              process.env.S3_REGION,
          bucket:              process.env.S3_BUCKET,
          useSSL:              process.env.S3_USE_SSL,
          multipartPartSizeMb: process.env.S3_MULTIPART_PART_SIZE_MB,
          multipartQueueSize:  process.env.S3_MULTIPART_QUEUE_SIZE,
          maxUploadMb:         process.env.S3_MAX_UPLOAD_MB,
          presignedTtlSeconds: process.env.S3_PRESIGNED_TTL_SECONDS,
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

  return result.data;
}
