// framework/runtime/kernel/bootstrap.ts
import { loadServices } from "../services/registry";

import { makeAuditEvent, type AuditWriter } from "./audit";
import { loadConfig, KernelConfigError } from "./config";
import { createKernelContainer } from "./container";
import { registerAdapters } from "./container.adapters";
import { installSignalHandlers, registerKernelDefaults } from "./container.defaults";
import { registerMetaServices } from "./container.meta";
import { registerRuntimeServices } from "./container.runtime";
import { TenantContextError } from "./tenantContext";
import { TOKENS } from "./tokens";

import type { RuntimeMode } from "./config.schema";

export interface BootstrapResult {
    mode: RuntimeMode;
    container: ReturnType<typeof createKernelContainer>;
}

/**
 * Exit code mapping (stable contract for systemd / docker / k8s).
 */
const EXIT_CODES: Record<string, number> = {
    // Config + boot
    CONFIG_FILE_ERROR: 2,
    CONFIG_VALIDATION_ERROR: 3,
    IAM_SECRET_REF_MISSING: 4,
    IAM_DEFAULT_REALM_MISSING: 5,

    // Auth safety
    ISSUER_REALM_MISMATCH: 6,
    PROD_NONPROD_IDP: 7,
    PROD_MISSING_BASE_URL: 8,
    PROD_WILDCARD_REDIRECT: 9,

    // Tenant/realm resolution
    UNKNOWN_REALM: 20,
    UNKNOWN_TENANT: 21,
    UNKNOWN_ORG: 22,
    ORG_WITHOUT_TENANT: 23,

    // Runtime engine
    JOB_QUEUE_CONNECT_ERROR: 60,
    SCHEDULER_START_ERROR: 61,

    // Generic
    BOOTSTRAP_ERROR: 50,
};

type BootLevel = "info" | "warn" | "error";

interface BootSink {
    write(level: BootLevel, message: string, meta?: Record<string, unknown>): void;
}

/**
 * Console sink for early boot (before DI).
 */
class ConsoleBootSink implements BootSink {
    write(level: BootLevel, message: string, meta?: Record<string, unknown>) {
        const line = `[kernel] ${new Date().toISOString()} ${message}${meta ? ` ${safeJson(meta)}` : ""}`;
        // eslint-disable-next-line no-console
        console[level](line);
    }
}

/**
 * Sink that writes to the container logger (pino-like shape) once available.
 * Your container logger signature is (meta, msg?) => ...
 */
class ContainerLoggerSink implements BootSink {
    constructor(private logger: any) { }

    write(level: BootLevel, message: string, meta?: Record<string, unknown>) {
        const m = meta ?? {};
        if (level === "info") this.logger.info?.(m, message);
        else if (level === "warn") this.logger.warn?.(m, message);
        else this.logger.error?.(m, message);
    }
}

/**
 * BootLogger that can switch sinks without changing call sites.
 */
class BootLogger {
    private sink: BootSink;
    constructor(initial: BootSink) {
        this.sink = initial;
    }
    setSink(next: BootSink) {
        this.sink = next;
    }
    info(message: string, meta?: Record<string, unknown>) {
        this.sink.write("info", message, meta);
    }
    warn(message: string, meta?: Record<string, unknown>) {
        this.sink.write("warn", message, meta);
    }
    error(message: string, meta?: Record<string, unknown>) {
        this.sink.write("error", message, meta);
    }
}

function safeJson(obj: unknown): string {
    try {
        return JSON.stringify(obj);
    } catch {
        return '"[unserializable]"';
    }
}

function isObject(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null;
}

function errorToMeta(err: unknown): Record<string, unknown> {
    if (err instanceof KernelConfigError) {
        return { kind: "KernelConfigError", code: err.code, message: err.message, meta: err.meta ?? null };
    }
    if (err instanceof TenantContextError) {
        return { kind: "TenantContextError", code: err.code, message: err.message, meta: err.meta ?? null };
    }
    // RealmSafetyError has same shape (code + meta)
    if (err instanceof Error && "code" in err && typeof (err as any).code === "string") {
        const e = err as Error & { code: string; meta?: Record<string, unknown> };
        if (EXIT_CODES[e.code]) {
            return { kind: e.constructor.name, code: e.code, message: e.message, meta: e.meta ?? null };
        }
    }
    if (err instanceof Error) {
        return { kind: "Error", name: err.name, message: err.message, stack: err.stack ?? null };
    }
    return { kind: "Unknown", value: isObject(err) ? err : String(err) };
}

function resolveExitCode(err: unknown): number {
    const code =
        err instanceof KernelConfigError ? err.code : err instanceof TenantContextError ? err.code : undefined;

    if (code && EXIT_CODES[code]) return EXIT_CODES[code];
    return EXIT_CODES.BOOTSTRAP_ERROR;
}

/**
 * Boot summary: useful in logs & diagnostics; always sanitized.
 */
function bootSummary(config: any) {
    const realmKeys = Object.keys(config.iam?.realms ?? {});
    const tenantsPerRealm = realmKeys.reduce<Record<string, number>>((acc, rk) => {
        const tenants = config.iam.realms?.[rk]?.tenants ?? {};
        acc[rk] = Object.keys(tenants).length;
        return acc;
    }, {});

    return {
        env: config.env,
        mode: config.mode,
        serviceName: config.serviceName,
        port: config.port,
        logLevel: config.logLevel,

        db: {
            url: "[redacted]",
            adminUrl: config.db?.adminUrl ? "[redacted]" : undefined,
            poolMax: config.db?.poolMax,
        },

        iam: {
            strategy: config.iam?.strategy,
            defaultRealmKey: config.iam?.defaultRealmKey,
            realms: realmKeys,
            tenantsPerRealm,
        },

        telemetry: {
            enabled: config.telemetry?.enabled,
            otlpEndpoint: config.telemetry?.otlpEndpoint ? "[present]" : undefined,
        },
    };
}

/**
 * Avoid double-installing global process handlers (tests / repeated boot calls).
 */
let PROCESS_GUARDS_INSTALLED = false;

export async function bootstrap(): Promise<BootstrapResult> {
    const boot = new BootLogger(new ConsoleBootSink());
    const bootId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    // We'll keep references once DI is ready
    let auditWriter: AuditWriter | undefined;

    const auditBootFatalBestEffort = async (meta: Record<string, unknown>) => {
        try {
            await auditWriter?.write(
                makeAuditEvent({
                    type: "runtime.boot.fatal",
                    level: "error",
                    actor: { kind: "system" },
                    meta: { bootId, ...meta },
                }),
            );
        } catch {
            // ignore audit failures at boot
        }
    };

    const fatal = async (err: unknown) => {
        const meta = errorToMeta(err);
        const exitCode = resolveExitCode(err);

        boot.error("boot.fatal", { bootId, exitCode, ...meta });
        await auditBootFatalBestEffort({ exitCode, ...meta });

        process.exitCode = exitCode;
    };

    // Guard: capture unexpected async failures (install once)
    if (!PROCESS_GUARDS_INSTALLED) {
        PROCESS_GUARDS_INSTALLED = true;

        process.on("unhandledRejection", (reason) => {
            boot.error("boot.unhandledRejection", { bootId, reason: isObject(reason) ? reason : String(reason) });
            process.exitCode = EXIT_CODES.BOOTSTRAP_ERROR;
        });

        process.on("uncaughtException", (err) => {
            boot.error("boot.uncaughtException", { bootId, ...errorToMeta(err) });
            process.exitCode = EXIT_CODES.BOOTSTRAP_ERROR;
        });
    }

    boot.info("boot.start", { bootId });

    try {
        // loadConfig audit goes to boot logger (console now)
        const config = loadConfig({
            audit: {
                info: (m, meta) => boot.info(m, { bootId, ...(meta ?? {}) }),
                warn: (m, meta) => boot.warn(m, { bootId, ...(meta ?? {}) }),
                error: (m, meta) => boot.error(m, { bootId, ...(meta ?? {}) }),
            },
        });

        boot.info("boot.summary", { bootId, ...bootSummary(config) });

        // Environment guardrails (fail fast before DI setup)
        {
            const { assertEnvironmentGuardrails } = await import(
                "../services/platform/foundation/security/realm-safety"
            );
            assertEnvironmentGuardrails(config);
            boot.info("boot.env_guardrails.passed", { bootId, env: config.env });
        }

        const container = createKernelContainer();

        // Pass env snapshot from config loader; do NOT read process.env elsewhere
        registerKernelDefaults(container, config, {
            bootId, // ✅ add this line
            envSnapshot: {
                NODE_ENV: config.env,
                MODE: config.mode,
                SERVICE_NAME: config.serviceName,
            },
        });

        // Register adapters (DB, cache, storage, telemetry, auth)
        registerAdapters(container, config);

        // Register META Engine services
        await registerMetaServices(container, config);

        // Register runtime execution engines (jobQueue, workerPool, scheduler)
        // Must happen BEFORE loadServices() — modules resolve TOKENS.jobQueue during register()
        await registerRuntimeServices(container, config);

        // Boot-time realm safety: verify IdP issuer matches config (staging/production only)
        {
            const { assertBootRealmSafety } = await import(
                "../services/platform/foundation/security/realm-safety"
            );
            await assertBootRealmSafety(config);
            boot.info("boot.realm_safety.passed", { bootId, env: config.env });
        }

        // Now DI is ready: switch boot logs to container logger + get audit writer
        const logger = await container.resolve<any>(TOKENS.logger);
        auditWriter = await container.resolve<AuditWriter>(TOKENS.auditWriter);

        boot.setSink(new ContainerLoggerSink(logger));
        boot.info("boot.logger.switched", { bootId, to: "container.logger" });

        // Audit: boot start event (now DI is ready)
        await auditWriter.write(
            makeAuditEvent({
                type: "runtime.boot.start",
                level: "info",
                actor: { kind: "system" },
                meta: { bootId, ...bootSummary(config) },
            }),
        );

        // Kernel side effects after registration
        await installSignalHandlers(container);

        // Load modules/services (definitions -> registries)
        await loadServices(container);

        // Fail-fast: validate runtime engine availability for worker/scheduler modes
        if (config.mode === "worker" || config.mode === "scheduler") {
            try {
                const jobQueue = await container.resolve<any>(TOKENS.jobQueue);
                const metrics = await jobQueue.getMetrics();
                boot.info("boot.jobQueue.connected", { bootId, ...metrics });
            } catch (err) {
                boot.error("boot.jobQueue.failed", { bootId, error: String(err) });
                process.exitCode = EXIT_CODES.JOB_QUEUE_CONNECT_ERROR;
                throw err;
            }
        }

        boot.info("boot.mode.start", { bootId, mode: config.mode });

        if (config.mode === "api") {
            const { startApiRuntime } = await import("../runtimes/api/startApiRuntime");
            await startApiRuntime(container);
        } else if (config.mode === "worker") {
            const { startWorkerRuntime } = await import("../runtimes/worker/startWorkerRuntime");
            await startWorkerRuntime(container);
        } else if (config.mode === "scheduler") {
            const { startSchedulerRuntime } = await import("../runtimes/scheduler/startSchedulerRuntime");
            await startSchedulerRuntime(container);
        } else {
            throw new KernelConfigError("CONFIG_VALIDATION_ERROR", `Unknown mode: ${String((config as any).mode)}`);
        }

        boot.info("boot.success", { bootId, mode: config.mode, serviceName: config.serviceName });

        await auditWriter.write(
            makeAuditEvent({
                type: "runtime.boot.success",
                level: "info",
                actor: { kind: "system" },
                meta: { bootId, mode: config.mode, serviceName: config.serviceName },
            }),
        );

        return { mode: config.mode, container };
    } catch (err) {
        await fatal(err);
        throw err;
    }
}