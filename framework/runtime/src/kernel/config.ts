// framework/runtime/src/kernel/config.ts
import fs from "node:fs";
import path from "node:path";

import { RuntimeConfigSchema, type RuntimeConfig } from "./config.schema";

// Re-export RuntimeConfig for use in other modules
export type { RuntimeConfig };

/**
 * Audit logger for kernel boot/config.
 * Keep it "safe": do not log secrets. This runs before DI container is ready.
 */
export interface KernelAuditLogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}

function createDefaultAuditLogger(): KernelAuditLogger {
    const base =
        (level: "info" | "warn" | "error") =>
            (message: string, meta?: Record<string, unknown>) => {
                const payload = meta ? ` ${safeJson(meta)}` : "";
                // eslint-disable-next-line no-console
                console[level](`[kernel] ${message}${payload}`);
            };

    return { info: base("info"), warn: base("warn"), error: base("error") };
}

function safeJson(obj: unknown): string {
    try {
        return JSON.stringify(obj);
    } catch {
        return '"[unserializable]"';
    }
}

function env(name: string): string | undefined {
    const v = process.env[name];
    return v && v.trim().length ? v : undefined;
}

/**
 * SUPERSTAR env (highest precedence).
 * Convention:
 *   ATHYPER_SUPER__DATABASE_URL
 *   ATHYPER_SUPER__DATABASE_ADMIN_URL
 *   ATHYPER_SUPER__REDIS_URL
 *   ATHYPER_SUPER__S3_SECRET_KEY
 *   ATHYPER_SUPER__IAM_SECRET__<REF_NAME>
 */
function superEnv(name: string): string | undefined {
    return env(`ATHYPER_SUPER__${name}`);
}

/**
 * Locked keys:
 * - FILE: customer parameter JSON cannot set these (infra wiring/secrets)
 * - OVERRIDES: tests/code cannot set these (recommended)
 * - ENV: only lock if you want to disallow normal env overrides (usually keep empty)
 * - SUPERSTAR always wins
 */
const LOCK_FROM_FILE = new Set<string>([
    // ----------------------------
    // DB wiring (PgBouncer + admin)
    // ----------------------------
    "db.url", // must point to PgBouncer (contract)
    "db.adminUrl", // direct Postgres (ops-only)

    // ----------------------------
    // Redis wiring
    // ----------------------------
    "redis.url",

    // ----------------------------
    // S3 wiring + secrets
    // ----------------------------
    "s3.endpoint", // object store endpoint is infra wiring
    "s3.accessKey", // treat as secret-ish (credentials)
    "s3.secretKey", // secret
    "s3.region", // often tied to infra
    "s3.bucket", // shared naming / managed ops decision
    "s3.useSSL", // must align with endpoint/certs

    // ----------------------------
    // Telemetry (managed observability)
    // ----------------------------
    "telemetry.otlpEndpoint", // ensure traces/metrics go to your stack
    "telemetry.enabled", // prevent disabling in managed/prod

    // ----------------------------
    // IAM routing knobs (boot + jobs safety)
    // ----------------------------
    "iam.strategy", // ops decides single vs multi realm at deployment
    "iam.defaultRealmKey", // must be stable for scheduler/worker boot
    "iam.defaultTenantKey", // optional: enforce job default routing
    "iam.defaultOrgKey", // optional: enforce job default routing
]);
const LOCK_FROM_OVERRIDES = new Set<string>([...LOCK_FROM_FILE]);
const LOCK_FROM_ENV = new Set<string>([]);

/**
 * Secret ref resolver:
 * - realm.iam.clientSecretRef -> ATHYPER_SUPER__IAM_SECRET__<ref>
 */
function resolveIamSecretRef(ref?: string): string | undefined {
    if (!ref) return undefined;
    return env(`ATHYPER_SUPER__IAM_SECRET__${ref}`);
}

// -------------------------
// Errors
// -------------------------
export class KernelConfigError extends Error {
    readonly code: string;
    readonly meta?: Record<string, unknown>;
    constructor(code: string, message: string, meta?: Record<string, unknown>) {
        super(message);
        this.code = code;
        this.meta = meta;
    }
}

export interface LoadConfigOptions {
    overrides?: Partial<RuntimeConfig>;
    audit?: KernelAuditLogger;
}

// -------------------------
// path + file
// -------------------------
function resolveConfigPath(filePath?: string): string | undefined {
    if (!filePath) return undefined;

    if (path.isAbsolute(filePath)) return filePath;

    const meshBase = env("MESH_CONFIG");
    if (meshBase) return path.resolve(meshBase, filePath);

    return path.resolve(process.cwd(), filePath);
}

function readJsonConfigFile(filePath?: string): Record<string, unknown> {
    const abs = resolveConfigPath(filePath);
    if (!abs) return {};

    if (!fs.existsSync(abs)) {
        throw new Error(`[config] ATHYPER_KERNEL_CONFIG_PATH not found: ${abs}`);
    }

    const text = fs.readFileSync(abs, "utf8");
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch (e) {
        throw new Error(`[config] Invalid JSON in ${abs}: ${(e as Error).message}`);
    }
}

// -------------------------
// small type helpers
// -------------------------
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null;
}

function isPlainObject(value: unknown): value is JsonObject {
    return isObject(value) && !Array.isArray(value);
}

// -------------------------
// locked-path helpers
// -------------------------
function getPath(obj: unknown, dotPath: string): unknown {
    return dotPath.split(".").reduce<unknown>((acc, k) => {
        if (!isObject(acc)) return undefined;
        return acc[k];
    }, obj);
}

function deletePath(obj: unknown, dotPath: string): void {
    if (!isObject(obj)) return;

    const keys = dotPath.split(".");
    const last = keys.pop();
    if (!last) return;

    const parent = keys.reduce<unknown>((acc, k) => {
        if (!isObject(acc)) return undefined;
        return acc[k];
    }, obj);

    if (!isObject(parent)) return;
    delete parent[last];
}

function stripLockedPaths(candidate: unknown, locked: Set<string>): void {
    for (const p of locked) {
        if (getPath(candidate, p) !== undefined) deletePath(candidate, p);
    }
}

// -------------------------
// deepMerge (objects only)
// -------------------------
function deepMerge(...objs: unknown[]): JsonObject {
    const result: JsonObject = {};
    for (const obj of objs) mergeInto(result, obj);
    return result;
}

function mergeInto(target: JsonObject, src: unknown): void {
    if (!isPlainObject(src)) return;

    for (const [k, v] of Object.entries(src)) {
        if (v === undefined) continue;

        if (isPlainObject(v)) {
            const existing = target[k];
            target[k] = isPlainObject(existing) ? existing : {};
            mergeInto(target[k] as JsonObject, v);
        } else {
            target[k] = v;
        }
    }
}

// -------------------------
// superstar mapping
// -------------------------
function mapSuperstarEnv(): Record<string, unknown> {
    return {
        db: { url: superEnv("DATABASE_URL"), adminUrl: superEnv("DATABASE_ADMIN_URL") },
        redis: { url: superEnv("REDIS_URL") },
        s3: {
            endpoint: superEnv("S3_ENDPOINT"),
            accessKey: superEnv("S3_ACCESS_KEY"),
            secretKey: superEnv("S3_SECRET_KEY"),
            region: superEnv("S3_REGION"),
            bucket: superEnv("S3_BUCKET"),
            useSSL: superEnv("S3_USE_SSL"),
        },
        telemetry: { otlpEndpoint: superEnv("OTLP_ENDPOINT"), enabled: superEnv("TELEMETRY_ENABLED") },
        iam: {
            strategy: superEnv("IAM_STRATEGY"),
            defaultRealmKey: superEnv("IAM_DEFAULT_REALM"),
            defaultTenantKey: superEnv("IAM_DEFAULT_TENANT"),
            defaultOrgKey: superEnv("IAM_DEFAULT_ORG"),
        },
    };
}

// -------------------------
// audit sanitization
// -------------------------
function sanitizeForAudit(input: unknown): unknown {
    const clone = safeClone(input ?? {});

    if (isObject(clone) && isObject(clone.db)) {
        if ("url" in clone.db) clone.db.url = "[redacted]";
        if ("adminUrl" in clone.db) clone.db.adminUrl = clone.db.adminUrl ? "[redacted]" : undefined;
    }

    if (isObject(clone) && isObject(clone.redis)) {
        if ("url" in clone.redis) clone.redis.url = "[redacted]";
    }

    if (isObject(clone) && isObject(clone.s3)) {
        if ("secretKey" in clone.s3) clone.s3.secretKey = "[redacted]";
    }

    redactByKey(clone, ["secret", "password", "token", "clientSecret", "secretKey"]);
    return limitSize(clone, 24_000);
}

function safeClone<T>(obj: T): T {
    try {
        return JSON.parse(JSON.stringify(obj)) as T;
    } catch {
        return {} as T;
    }
}

function redactByKey(obj: unknown, keys: string[]): void {
    if (!isObject(obj)) return;

    for (const k of Object.keys(obj)) {
        const v = obj[k];
        const lower = k.toLowerCase();

        if (keys.some((x) => lower.includes(x.toLowerCase()))) {
            obj[k] = "[redacted]";
        } else if (isObject(v)) {
            redactByKey(v, keys);
        }
    }
}

function limitSize(obj: unknown, maxChars: number): unknown {
    try {
        const s = JSON.stringify(obj);
        if (s.length <= maxChars) return obj;
        return { truncated: true, size: s.length, maxChars };
    } catch {
        return { truncated: true };
    }
}

// -------------------------
// loadConfig
// -------------------------
type Source = "file" | "env" | "overrides" | "superstar";
type SourceMap = Record<string, Source>;

function setSource(map: SourceMap, dotPath: string, source: Source) {
    const prev = map[dotPath];
    if (prev === "superstar") return;
    map[dotPath] = source;
}

function tagLeaves(map: SourceMap, obj: unknown, basePath: string, source: Source): void {
    if (!isPlainObject(obj)) return;

    for (const [k, v] of Object.entries(obj)) {
        const p = basePath ? `${basePath}.${k}` : k;
        if (v === undefined) continue;

        if (isPlainObject(v)) {
            if (k === "defaults") {
                setSource(map, p, source);
                continue;
            }
            tagLeaves(map, v, p, source);
        } else {
            setSource(map, p, source);
        }
    }
}

/**
 * loadConfig: file < env < overrides < SUPERSTAR
 */
export function loadConfig(options?: LoadConfigOptions): RuntimeConfig {
    const audit = options?.audit ?? createDefaultAuditLogger();
    const overrides = options?.overrides;

    const filePath = env("ATHYPER_KERNEL_CONFIG_PATH");
    const resolvedFilePath = resolveConfigPath(filePath);

    audit.info("config.load.start", {
        filePath: filePath ?? null,
        resolvedFilePath: resolvedFilePath ?? null,
        meshConfig: env("MESH_CONFIG") ?? null,
    });

    // file
    let fileConfig: Record<string, unknown> = {};
    try {
        fileConfig = readJsonConfigFile(filePath);
    } catch (e) {
        audit.error("config.load.file_error", { message: (e as Error).message });
        throw new KernelConfigError("CONFIG_FILE_ERROR", (e as Error).message, {
            filePath: resolvedFilePath ?? filePath ?? null,
        });
    }

    // env mapping only here
    const envConfig = {
        env: env("ENVIRONMENT") ?? env("NODE_ENV"),
        mode: env("MODE"),
        serviceName: env("SERVICE_NAME"),
        port: env("PORT"),

        logLevel: env("LOG_LEVEL"),
        shutdownTimeoutMs: env("SHUTDOWN_TIMEOUT_MS"),
        publicBaseUrl: env("PUBLIC_BASE_URL"),

        db: { url: env("DATABASE_URL"), adminUrl: env("DATABASE_ADMIN_URL"), poolMax: env("DB_POOL_MAX") },

        iam: {
            strategy: env("IAM_STRATEGY"),
            defaultRealmKey: env("IAM_DEFAULT_REALM"),
            defaultTenantKey: env("IAM_DEFAULT_TENANT"),
            defaultOrgKey: env("IAM_DEFAULT_ORG"),
            // realms expected in JSON
        },

        redis: { url: env("REDIS_URL") },

        s3: {
            endpoint: env("S3_ENDPOINT"),
            accessKey: env("S3_ACCESS_KEY"),
            secretKey: env("S3_SECRET_KEY"),
            region: env("S3_REGION"),
            bucket: env("S3_BUCKET"),
            useSSL: env("S3_USE_SSL"),
        },

        telemetry: { otlpEndpoint: env("OTLP_ENDPOINT"), enabled: env("TELEMETRY_ENABLED") },
    };

    const superstarConfig = mapSuperstarEnv();

    // apply locks per source
    stripLockedPaths(fileConfig, LOCK_FROM_FILE);
    stripLockedPaths(envConfig, LOCK_FROM_ENV);
    if (overrides) stripLockedPaths(overrides, LOCK_FROM_OVERRIDES);

    // source tagging (no values)
    const sources: SourceMap = {};
    tagLeaves(sources, fileConfig, "", "file");
    tagLeaves(sources, envConfig, "", "env");
    tagLeaves(sources, overrides ?? {}, "", "overrides");
    tagLeaves(sources, superstarConfig, "", "superstar");

    // merge + validate
    const raw = deepMerge(fileConfig, envConfig, overrides ?? {}, superstarConfig);
    const parsed = RuntimeConfigSchema.safeParse(raw);

    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
        audit.error("config.load.validation_error", { issues, sources });
        throw new KernelConfigError(
            "CONFIG_VALIDATION_ERROR",
            `Invalid runtime config:\n${issues.map((x) => `${x.path}: ${x.message}`).join("\n")}`,
            { issues },
        );
    }

    const cfg = parsed.data;

    // IAM integrity checks
    if (!cfg.iam.realms[cfg.iam.defaultRealmKey]) {
        const meta = {
            defaultRealmKey: cfg.iam.defaultRealmKey,
            availableRealms: Object.keys(cfg.iam.realms),
            sources,
        };
        audit.error("config.load.iam_default_realm_missing", meta);
        throw new KernelConfigError(
            "IAM_DEFAULT_REALM_MISSING",
            `[iam] defaultRealmKey not found in iam.realms: ${cfg.iam.defaultRealmKey}`,
            meta,
        );
    }

    for (const [realmKey, realm] of Object.entries(cfg.iam.realms)) {
        const ref = realm.iam.clientSecretRef;
        if (ref && !resolveIamSecretRef(ref)) {
            const meta = { realmKey, clientSecretRef: ref, sources };
            audit.error("config.load.iam_secret_ref_missing", meta);
            throw new KernelConfigError(
                "IAM_SECRET_REF_MISSING",
                `[iam] Secret ref not found in SUPERSTAR env for realm=${realmKey}, ref=${ref}`,
                meta,
            );
        }
    }

    audit.info("config.load.success", {
        env: cfg.env,
        mode: cfg.mode,
        serviceName: cfg.serviceName,
        realms: Object.keys(cfg.iam.realms),
        iamStrategy: cfg.iam.strategy,
        sources,
        snapshot: sanitizeForAudit({
            env: cfg.env,
            mode: cfg.mode,
            serviceName: cfg.serviceName,
            port: cfg.port,
            logLevel: cfg.logLevel,
            shutdownTimeoutMs: cfg.shutdownTimeoutMs,
            publicBaseUrl: cfg.publicBaseUrl,
            db: cfg.db,
            redis: cfg.redis,
            s3: cfg.s3,
            telemetry: cfg.telemetry,
            iam: cfg.iam,
        }),
    });

    return cfg;
}

/**
 * Exported helper for kernel modules to resolve IAM secrets without reading process.env elsewhere.
 */
export function resolveRealmClientSecret(cfg: RuntimeConfig, realmKey: string): string | undefined {
    const realm = cfg.iam.realms[realmKey];
    if (!realm) return undefined;
    return resolveIamSecretRef(realm.iam.clientSecretRef);
}