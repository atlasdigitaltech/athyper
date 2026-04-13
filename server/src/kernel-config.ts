// server/src/kernel-config.ts
//
// Kernel configuration loader for the athyper runtime.
//
// Reads the JSON parameter file mounted by Docker Compose at
// ${MESH_CONFIG}/${ATHYPER_KERNEL_CONFIG_PATH} and validates it with Zod.
// The schema mirrors mesh/config/apps/kernel.config.schema.json.
//
// This layer provides what env vars alone cannot:
//   - Multi-realm IAM configuration (issuerUrl, clientId per realm)
//   - Per-realm feature flags and tenant/org hierarchy
//   - allowedAzp validation lists
//
// OPTIONAL: when ATHYPER_KERNEL_CONFIG_PATH is not set (running the server
// directly outside Docker mesh), loadKernelConfig() returns null and the
// server falls back to single-realm env-var-only IAM config.
//
// LOCKED fields (db.url, redis.url, s3.*, telemetry.otlpEndpoint) are
// stripped at load time — their values always come from env vars, not the file.
//
// Secret resolution (SUPERSTAR pattern):
//   JSON:    clientSecretRef: "IAM_ATHYPER_CLIENT_SECRET"
//   Env var: ATHYPER_SUPER__IAM_SECRET__IAM_ATHYPER_CLIENT_SECRET
//   Result:  clientSecret = process.env["ATHYPER_SUPER__IAM_SECRET__IAM_ATHYPER_CLIENT_SECRET"]

import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

// ─── SUPERSTAR secret resolution ──────────────────────────────────────────────

const SUPERSTAR_IAM_SECRET_PREFIX = "ATHYPER_SUPER__IAM_SECRET__";

function resolveSecret(ref: string): string {
  const envKey = `${SUPERSTAR_IAM_SECRET_PREFIX}${ref}`;
  const value = process.env[envKey];
  if (!value) {
    throw new Error(
      `Kernel config: clientSecretRef "${ref}" cannot be resolved. ` +
        `Expected env var: ${envKey}`,
    );
  }
  return value;
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const RealmIamSchema = z.object({
  issuerUrl: z.string().url(),
  clientId: z.string().min(1),
  allowedAzp: z.array(z.string()).default([]),
  clientSecretRef: z.string().min(1),
});

const RealmDefaultsSchema = z.object({
  features: z
    .object({
      metaStudio: z.boolean().default(false),
      debugMode: z.boolean().default(false),
    })
    .default({ metaStudio: false, debugMode: false }),
  policies: z
    .object({
      strictTenantIsolation: z.boolean().default(true),
    })
    .default({ strictTenantIsolation: true }),
});

const TenantSchema = z.object({
  defaults: z
    .object({
      country: z.string().default("US"),
      currency: z.string().default("USD"),
      timezone: z.string().default("UTC"),
    })
    .default({ country: "US", currency: "USD", timezone: "UTC" }),
  orgs: z.record(z.string(), z.unknown()).default({}),
});

const RealmSchema = z.object({
  iam: RealmIamSchema,
  defaults: RealmDefaultsSchema.default({
    features: { metaStudio: false, debugMode: false },
    policies: { strictTenantIsolation: true },
  }),
  tenants: z.record(z.string(), TenantSchema).default({}),
});

const IamKernelSchema = z.object({
  strategy: z.enum(["single_realm", "multi_realm"]).default("single_realm"),
  defaultRealmKey: z.string().min(1),
  defaultTenantKey: z.string().nullable().default(null),
  defaultOrgKey: z.string().nullable().default(null),
  requireTenantClaimsInProd: z.boolean().default(false),
  realms: z.record(z.string(), RealmSchema),
});

const KernelConfigSchema = z.object({
  env: z.enum(["local", "staging", "production"]).default("local"),
  mode: z.string().default("api"),
  serviceName: z.string().default("athyper-runtime"),
  port: z.coerce.number().int().positive().default(3000),
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  shutdownTimeoutMs: z.coerce.number().int().positive().default(15_000),
  publicBaseUrl: z.string().url(),
  publicWebUrl: z.string().url(),
  iam: IamKernelSchema,
  telemetry: z
    .object({
      serviceName: z.string().default("athyper-runtime"),
      serviceVersion: z.string().default("1.0.0"),
    })
    .default({ serviceName: "athyper-runtime", serviceVersion: "1.0.0" }),
});

// ─── Public types ─────────────────────────────────────────────────────────────

export type RuntimeKernelConfig = z.infer<typeof KernelConfigSchema>;
export type KernelRealmConfig = z.infer<typeof RealmSchema>;
export type KernelIamConfig = z.infer<typeof IamKernelSchema>;

/** Realm IAM config with secret resolved (clientSecretRef → clientSecret). */
export interface ResolvedRealmIam {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  allowedAzp: string[];
}

export interface ResolvedRealm extends Omit<KernelRealmConfig, "iam"> {
  iam: ResolvedRealmIam;
}

export interface ResolvedKernelConfig
  extends Omit<RuntimeKernelConfig, "iam"> {
  iam: Omit<KernelIamConfig, "realms"> & {
    realms: Record<string, ResolvedRealm>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip $comment, $schema annotations and LOCKED_USE_ENV_VAR sentinel values. */
function stripLocked(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLocked);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "$comment" || k === "$schema") continue;
    if (v === "LOCKED_USE_ENV_VAR") continue;
    result[k] = stripLocked(v);
  }
  return result;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load, validate, and resolve secrets from the kernel config JSON file.
 *
 * Returns null when ATHYPER_KERNEL_CONFIG_PATH is not set (env-var-only mode).
 * Throws on file read errors, JSON parse failures, schema validation errors,
 * or unresolvable clientSecretRef values.
 */
export function loadKernelConfig(): ResolvedKernelConfig | null {
  const configPath = process.env.ATHYPER_KERNEL_CONFIG_PATH;
  if (!configPath) return null;

  const meshConfig = process.env.MESH_CONFIG ?? "/config";
  const fullPath = join(meshConfig, configPath);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(fullPath, "utf-8"));
  } catch (err) {
    throw new Error(
      `Kernel config: cannot read "${fullPath}": ${(err as Error).message}`,
    );
  }

  const stripped = stripLocked(raw);

  const result = KernelConfigSchema.safeParse(stripped);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Kernel config invalid — check ${fullPath}:\n${issues}`);
  }

  const parsed = result.data;

  // Resolve clientSecretRef → clientSecret for every realm
  const resolvedRealms: Record<string, ResolvedRealm> = {};
  for (const [realmKey, realm] of Object.entries(parsed.iam.realms)) {
    resolvedRealms[realmKey] = {
      ...realm,
      iam: {
        issuerUrl: realm.iam.issuerUrl,
        clientId: realm.iam.clientId,
        clientSecret: resolveSecret(realm.iam.clientSecretRef),
        allowedAzp: realm.iam.allowedAzp,
      },
    };
  }

  return { ...parsed, iam: { ...parsed.iam, realms: resolvedRealms } };
}

// ─── Consumer helpers ─────────────────────────────────────────────────────────

/**
 * Get the default realm from a resolved kernel config.
 * Throws if defaultRealmKey is missing from realms.
 */
export function getDefaultRealm(cfg: ResolvedKernelConfig): ResolvedRealm {
  const realm = cfg.iam.realms[cfg.iam.defaultRealmKey];
  if (!realm) {
    throw new Error(
      `Kernel config: defaultRealmKey "${cfg.iam.defaultRealmKey}" not found in iam.realms. ` +
        `Available: ${Object.keys(cfg.iam.realms).join(", ")}`,
    );
  }
  return realm;
}

/**
 * Build the additionalRealms map for createAuthAdapter.
 * Excludes the default realm (it becomes the primary realm).
 */
export function buildAdditionalRealms(
  cfg: ResolvedKernelConfig,
): Record<string, { issuerUrl: string; clientId: string }> {
  const out: Record<string, { issuerUrl: string; clientId: string }> = {};
  for (const [key, realm] of Object.entries(cfg.iam.realms)) {
    if (key === cfg.iam.defaultRealmKey) continue;
    out[key] = { issuerUrl: realm.iam.issuerUrl, clientId: realm.iam.clientId };
  }
  return out;
}
