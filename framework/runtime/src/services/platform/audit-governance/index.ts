/**
 * Audit & Governance — Module Composition Root
 *
 * Registers all audit services, repos, workers, and health checks.
 * Follows the RuntimeModule pattern (register + contribute).
 */

import { TOKENS } from "../../../kernel/tokens.js";

import { ActivityTimelineService } from "./domain/activity-timeline.service.js";
import { AuditAccessReportService } from "./domain/audit-access-report.service.js";
import { AuditDsarService } from "./domain/audit-dsar.service.js";
import { AuditExplainabilityService } from "./domain/audit-explainability.service.js";
import { LegalHoldService } from "./domain/legal-hold.service.js";
import { PolicyExplainabilityService } from "./domain/policy-explainability.service.js";
import { QuotaEnforcementService } from "./domain/quota-enforcement.guard.js";
import { createAuditFeatureFlagResolver } from "./domain/audit-feature-flags.js";
import { AuditIntegrityService } from "./domain/audit-integrity.service.js";
import { createAuditLoadSheddingService } from "./domain/audit-load-shedding.service.js";
import { AuditQueryPolicyGate } from "./domain/audit-query-gate.js";
import { AuditRateLimiter } from "./domain/audit-rate-limiter.js";
import { AuditReplayService } from "./domain/audit-replay.service.js";
import { AuditSlowQueryHandler } from "./domain/audit-slow-query.handler.js";
import { AuditStorageTieringService } from "./domain/audit-storage-tiering.service.js";
import { AuditDlqManager } from "./domain/AuditDlqManager.js";
import { createColumnEncryptionService } from "./domain/column-encryption.service.js";
import { AuditHashChainService } from "./domain/hash-chain.service.js";
import { createRedactionPipeline } from "./domain/redaction-pipeline.js";
import { ResilientAuditWriter } from "./domain/resilient-audit-writer.js";
import { createDrainAuditOutboxHandler } from "./jobs/workers/drainAuditOutbox.worker.js";
import {
  AuditMetrics,
  createAuditHealthChecker,
} from "./observability/metrics.js";
import {
  GovernanceMetrics,
  createGovernanceHealthChecker,
} from "./observability/governance-metrics.js";
import { AuditArchiveMarkerRepo } from "./persistence/AuditArchiveMarkerRepo.js";
import { AuditDlqRepo } from "./persistence/AuditDlqRepo.js";
import { AuditOutboxRepo } from "./persistence/AuditOutboxRepo.js";
import { createWorkflowAuditRepository } from "./persistence/WorkflowAuditRepository.js";

import type { AuditFeatureFlagResolver } from "./domain/audit-feature-flags.js";
import type { AuditLoadSheddingService } from "./domain/audit-load-shedding.service.js";
import type { AuditColumnEncryptionService } from "./domain/column-encryption.service.js";
import type { AuditRedactionPipeline } from "./domain/redaction-pipeline.js";
import type { WorkflowAuditRepository } from "./persistence/WorkflowAuditRepository.js";
import type { RuntimeConfig } from "../../../kernel/config.schema.js";
import type { Container } from "../../../kernel/container.js";
import type { Logger } from "../../../kernel/logger.js";
import type { RuntimeModule } from "../../types.js";
import type { JobRegistry } from "../foundation/registries/jobs.registry.js";
import type { AdapterCircuitBreakers } from "../foundation/resilience/adapter-protection.js";
import type { MaskingService } from "../foundation/security/field-security/masking.service.js";
import type { DB } from "@athyper/adapter-db";
import type {
  CircuitBreaker,
  JobQueue,
  MetricsRegistry,
  HealthCheckRegistry,
  RateLimiter,
} from "@athyper/core";
import type { Kysely } from "kysely";

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
  name: "platform.audit-governance",

  async register(c: Container) {
    const db = await c.resolve<Kysely<DB>>(TOKENS.db);
    const logger = await c.resolve<Logger>(TOKENS.logger);

    logger.info("[audit-governance] Registering module");

    // ── Feature Flags ─────────────────────────────────────────────
    c.register(
      TOKENS.auditFeatureFlags,
      async () => {
        let config: RuntimeConfig | undefined;
        try {
          config = await c.resolve<RuntimeConfig>(TOKENS.config);
        } catch {
          // Config not available
        }

        const auditConfig = config?.audit ?? {};

        return createAuditFeatureFlagResolver(db, {
          defaults: {
            writeMode: (auditConfig as any).writeMode ?? "outbox",
            hashChainEnabled: (auditConfig as any).hashChainEnabled ?? true,
            timelineEnabled: (auditConfig as any).timelineEnabled ?? true,
            encryptionEnabled: (auditConfig as any).encryptionEnabled ?? false,
          },
        });
      },
      "singleton",
    );

    // ── Column Encryption ────────────────────────────────────────────
    c.register(
      TOKENS.auditEncryption,
      async () => {
        let config: RuntimeConfig | undefined;
        try {
          config = await c.resolve<RuntimeConfig>(TOKENS.config);
        } catch {
          // Config not available
        }

        const auditConfig = config?.audit ?? {};
        const encryptionEnabled =
          (auditConfig as any).encryptionEnabled ?? false;

        if (!encryptionEnabled) {
          return null; // Encryption disabled
        }

        // Master key from env (never stored in config files)
        const masterKey = process.env.AUDIT_ENCRYPTION_MASTER_KEY;
        if (!masterKey) {
          logger.warn(
            {},
            "[audit-governance] Encryption enabled but AUDIT_ENCRYPTION_MASTER_KEY not set — encryption disabled",
          );
          return null;
        }

        return createColumnEncryptionService(masterKey);
      },
      "singleton",
    );

    // ── Load Shedding ─────────────────────────────────────────────
    c.register(
      TOKENS.auditLoadShedding,
      async () => {
        let config: RuntimeConfig | undefined;
        try {
          config = await c.resolve<RuntimeConfig>(TOKENS.config);
        } catch {
          // Config not available
        }

        const enabled = (config?.audit as any)?.loadSheddingEnabled ?? false;
        if (!enabled) {
          return null;
        }

        return createAuditLoadSheddingService(db);
      },
      "singleton",
    );

    // ── Hash Chain ─────────────────────────────────────────────────
    c.register(
      TOKENS.auditHashChain,
      async () => {
        // Hash chain per-tenant state is lazily initialized on first write
        // (computeHash defaults to GENESIS_HASH if no state loaded)
        return new AuditHashChainService();
      },
      "singleton",
    );

    // ── Redaction Pipeline ─────────────────────────────────────────
    c.register(
      TOKENS.auditRedaction,
      async () => {
        // MaskingService may not be registered yet — create a minimal one
        let masking: MaskingService;
        try {
          masking = await c.resolve<MaskingService>("security.masking");
        } catch {
          // Fallback: create a stub masking service if not registered
          masking = {
            mask: (value: unknown, _strategy: string, _opts?: unknown) =>
              String(value),
          } as MaskingService;
        }
        return createRedactionPipeline(masking);
      },
      "singleton",
    );

    // ── Persistence ────────────────────────────────────────────────
    c.register(
      TOKENS.auditOutboxRepo,
      async () => {
        return new AuditOutboxRepo(db);
      },
      "singleton",
    );

    c.register(
      TOKENS.auditWorkflowRepo,
      async () => {
        const hashChain = await c.resolve<AuditHashChainService>(
          TOKENS.auditHashChain,
        );
        const redaction = await c.resolve<AuditRedactionPipeline>(
          TOKENS.auditRedaction,
        );

        // Optional: resolve OTel trace context if telemetry adapter is available
        let traceResolver: (() => { traceId: string } | undefined) | undefined;
        try {
          const telemetry = await c.resolve<{
            getOtelTraceContext?: () => { traceId: string } | undefined;
          }>(TOKENS.telemetry);
          if (telemetry?.getOtelTraceContext) {
            traceResolver = telemetry.getOtelTraceContext;
          }
        } catch {
          // Telemetry adapter not available — no trace enrichment
        }

        // Optional: column-level encryption
        let encryption: AuditColumnEncryptionService | undefined;
        try {
          encryption =
            (await c.resolve<AuditColumnEncryptionService | null>(
              TOKENS.auditEncryption,
            )) ?? undefined;
        } catch {
          // Encryption not available
        }

        return createWorkflowAuditRepository(
          db,
          hashChain,
          redaction,
          traceResolver,
          encryption,
        );
      },
      "singleton",
    );

    // ── Rate Limiter ───────────────────────────────────────────────
    c.register(
      TOKENS.auditRateLimiter,
      async () => {
        let rateLimiter: RateLimiter;
        try {
          // Try to resolve a shared rate limiter from cache adapter
          const redis = await c.resolve<any>(TOKENS.cache);
          // Use a lightweight RateLimiter wrapping the Redis client
          const { RedisRateLimiter } =
            (await import("../foundation/security/redis-rate-limiter.js")) as any;
          rateLimiter = new RedisRateLimiter(redis, {
            maxRequests: 500,
            windowMs: 60_000, // 500 audit events per tenant per minute
          });
        } catch {
          // No Redis — create a pass-through limiter
          rateLimiter = {
            consume: async () => ({
              allowed: true,
              remaining: 999,
              limit: 999,
              resetMs: 0,
            }),
            check: async () => ({
              allowed: true,
              remaining: 999,
              limit: 999,
              resetMs: 0,
            }),
            reset: async () => {},
            getStatus: async () => ({
              allowed: true,
              remaining: 999,
              limit: 999,
              resetMs: 0,
            }),
          } as RateLimiter;
        }
        return new AuditRateLimiter(rateLimiter);
      },
      "singleton",
    );

    // ── Query Gate ─────────────────────────────────────────────────
    c.register(
      TOKENS.auditQueryGate,
      async () => {
        return new AuditQueryPolicyGate(db);
      },
      "singleton",
    );

    // ── Resilient Writer ───────────────────────────────────────────
    c.register(
      TOKENS.auditResilientWriter,
      async () => {
        const outboxRepo = await c.resolve<AuditOutboxRepo>(
          TOKENS.auditOutboxRepo,
        );
        const redaction = await c.resolve<AuditRedactionPipeline>(
          TOKENS.auditRedaction,
        );
        const hashChain = await c.resolve<AuditHashChainService>(
          TOKENS.auditHashChain,
        );
        const flagResolver = await c.resolve<AuditFeatureFlagResolver>(
          TOKENS.auditFeatureFlags,
        );

        // Optional: sync writer for "sync" write mode
        let syncWriter: WorkflowAuditRepository | undefined;
        try {
          syncWriter = await c.resolve<WorkflowAuditRepository>(
            TOKENS.auditWorkflowRepo,
          );
        } catch {
          // Not available — sync mode will fall back to outbox
        }

        let circuitBreaker: CircuitBreaker;
        try {
          const breakers = await c.resolve<AdapterCircuitBreakers>(
            TOKENS.circuitBreakers,
          );
          circuitBreaker = breakers.getOrCreate("audit-outbox", {
            failureThreshold: 10,
            failureWindow: 60_000,
            resetTimeout: 15_000,
            successThreshold: 3,
          });
        } catch {
          // Fallback: no-op circuit breaker (always closed)
          circuitBreaker = {
            execute: async <T>(fn: () => Promise<T>) => fn(),
            getMetrics: () => ({
              state: "CLOSED" as const,
              failures: 0,
              successes: 0,
              totalCalls: 0,
            }),
            reset: () => {},
          } as unknown as CircuitBreaker;
        }

        let metrics: AuditMetrics | undefined;
        try {
          metrics = await c.resolve<AuditMetrics>(TOKENS.auditMetrics);
        } catch {
          // Metrics not yet registered
        }

        // Optional: load shedding
        let loadShedding: AuditLoadSheddingService | undefined;
        try {
          loadShedding =
            (await c.resolve<AuditLoadSheddingService | null>(
              TOKENS.auditLoadShedding,
            )) ?? undefined;
        } catch {
          // Load shedding not available
        }

        return new ResilientAuditWriter(outboxRepo, circuitBreaker, {
          redaction,
          hashChain,
          metrics,
          logger,
          maxBufferSize: 1000,
          flagResolver,
          syncWriter,
          loadShedding,
        });
      },
      "singleton",
    );

    // ── Activity Timeline ──────────────────────────────────────────
    c.register(
      TOKENS.auditTimeline,
      async () => {
        const svc = new ActivityTimelineService(db);

        // Wire feature flag resolver for timeline toggle
        try {
          const flagResolver = await c.resolve<AuditFeatureFlagResolver>(
            TOKENS.auditFeatureFlags,
          );
          svc.setFlagResolver(flagResolver);
        } catch {
          // Flags not available — timeline always on
        }

        return svc;
      },
      "singleton",
    );

    // ── DLQ Repo ─────────────────────────────────────────────────
    c.register(
      TOKENS.auditDlqRepo,
      async () => {
        return new AuditDlqRepo(db);
      },
      "singleton",
    );

    // ── DLQ Manager ─────────────────────────────────────────────
    c.register(
      TOKENS.auditDlqManager,
      async () => {
        const dlqRepo = await c.resolve<AuditDlqRepo>(TOKENS.auditDlqRepo);
        const outboxRepo = await c.resolve<AuditOutboxRepo>(
          TOKENS.auditOutboxRepo,
        );

        let hashChain: AuditHashChainService | null = null;
        try {
          hashChain = await c.resolve<AuditHashChainService>(
            TOKENS.auditHashChain,
          );
        } catch {
          // Hash chain not available
        }

        return new AuditDlqManager(dlqRepo, outboxRepo, hashChain, logger);
      },
      "singleton",
    );

    // ── Metrics ────────────────────────────────────────────────────
    c.register(
      TOKENS.auditMetrics,
      async () => {
        const metricsRegistry = await c.resolve<MetricsRegistry>(
          TOKENS.metricsRegistry,
        );
        return new AuditMetrics(metricsRegistry);
      },
      "singleton",
    );

    // ── Integrity Service ────────────────────────────────────────
    c.register(
      TOKENS.auditIntegrity,
      async () => {
        const hashChain = await c.resolve<AuditHashChainService>(
          TOKENS.auditHashChain,
        );

        let metrics: AuditMetrics | undefined;
        try {
          metrics = await c.resolve<AuditMetrics>(TOKENS.auditMetrics);
        } catch {
          // Metrics not available
        }

        let objectStorage: any = null;
        try {
          objectStorage = await c.resolve<any>(TOKENS.objectStorage);
        } catch {
          // Object storage not available
        }

        return new AuditIntegrityService(db, hashChain, objectStorage, metrics);
      },
      "singleton",
    );

    // ── Replay Service ──────────────────────────────────────────
    c.register(
      TOKENS.auditReplay,
      async () => {
        const hashChain = await c.resolve<AuditHashChainService>(
          TOKENS.auditHashChain,
        );

        let dlqRepo: AuditDlqRepo | null = null;
        try {
          dlqRepo = await c.resolve<AuditDlqRepo>(TOKENS.auditDlqRepo);
        } catch {
          // DLQ not available
        }

        let objectStorage: any = null;
        try {
          objectStorage = await c.resolve<any>(TOKENS.objectStorage);
        } catch {
          // Object storage not available
        }

        return new AuditReplayService(db, hashChain, dlqRepo, objectStorage);
      },
      "singleton",
    );

    // ── Archive Marker Repo ──────────────────────────────────────
    c.register(
      TOKENS.auditArchiveMarkerRepo,
      async () => {
        return new AuditArchiveMarkerRepo(db);
      },
      "singleton",
    );

    // ── Storage Tiering ─────────────────────────────────────────
    c.register(
      TOKENS.auditStorageTiering,
      async () => {
        let config: RuntimeConfig | undefined;
        try {
          config = await c.resolve<RuntimeConfig>(TOKENS.config);
        } catch {
          // Config not available
        }

        const auditConfig = config?.audit ?? {};
        const tieringEnabled = (auditConfig as any).tieringEnabled ?? false;

        if (!tieringEnabled) {
          return null;
        }

        let archiveMarkerRepo: AuditArchiveMarkerRepo | null = null;
        try {
          archiveMarkerRepo = await c.resolve<AuditArchiveMarkerRepo>(
            TOKENS.auditArchiveMarkerRepo,
          );
        } catch {
          // Repo not available
        }

        return new AuditStorageTieringService(archiveMarkerRepo, {
          warmAfterDays: (auditConfig as any).warmAfterDays ?? 90,
          coldAfterDays: (auditConfig as any).coldAfterDays ?? 365,
        });
      },
      "singleton",
    );

    // ── Explainability Service ───────────────────────────────────
    c.register(
      TOKENS.auditExplainability,
      async () => {
        return new AuditExplainabilityService(db);
      },
      "singleton",
    );

    // ── Access Report Service ────────────────────────────────────
    c.register(
      TOKENS.auditAccessReport,
      async () => {
        return new AuditAccessReportService(db);
      },
      "singleton",
    );

    // ── DSAR Service ─────────────────────────────────────────────
    c.register(
      TOKENS.auditDsar,
      async () => {
        return new AuditDsarService(db);
      },
      "singleton",
    );

    // ── Legal Hold Service ──────────────────────────────────────
    c.register(
      TOKENS.legalHoldService,
      async () => {
        return new LegalHoldService(db);
      },
      "singleton",
    );

    // ── Policy Explainability Service ───────────────────────────
    c.register(
      TOKENS.policyExplainabilityService,
      async () => {
        return new PolicyExplainabilityService(db);
      },
      "singleton",
    );

    // ── Quota Enforcement Service ───────────────────────────────
    c.register(
      TOKENS.quotaEnforcementService,
      async () => {
        return new QuotaEnforcementService(db);
      },
      "singleton",
    );

    // ── Governance Metrics ──────────────────────────────────────
    c.register(
      TOKENS.governanceMetrics,
      async () => {
        const metricsRegistry = await c.resolve<MetricsRegistry>(
          TOKENS.metricsRegistry,
        );
        return new GovernanceMetrics(metricsRegistry);
      },
      "singleton",
    );
  },

  async contribute(c: Container) {
    const logger = await c.resolve<Logger>(TOKENS.logger);

    // ── Health Check ───────────────────────────────────────────────
    try {
      const healthRegistry = await c.resolve<HealthCheckRegistry>(
        TOKENS.healthRegistry,
      );
      const outboxRepo = await c.resolve<AuditOutboxRepo>(
        TOKENS.auditOutboxRepo,
      );
      const writer = await c.resolve<ResilientAuditWriter>(
        TOKENS.auditResilientWriter,
      );

      healthRegistry.register(
        "audit-pipeline",
        createAuditHealthChecker(outboxRepo, writer),
        { type: "internal", required: false },
      );
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "[audit-governance] Could not register health check",
      );
    }

    // ── Governance Health Check ──────────────────────────────────
    try {
      const healthRegistry = await c.resolve<HealthCheckRegistry>(
        TOKENS.healthRegistry,
      );
      const govDb = await c.resolve<Kysely<DB>>(TOKENS.db);

      healthRegistry.register(
        "governance",
        createGovernanceHealthChecker({
          getArchiveBacklog: async () => {
            const { sql } = await import("kysely");
            const r = await sql<{ cnt: string }>`
              SELECT COUNT(*)::text AS cnt FROM evt.archive_manifest
              WHERE verified_at IS NULL AND detached_at IS NULL
            `.execute(govDb);
            return Number(r.rows[0]?.cnt ?? 0);
          },
          getHeldManifestCount: async () => {
            const { sql } = await import("kysely");
            const r = await sql<{ cnt: string }>`
              SELECT COUNT(DISTINCT manifest_id)::text AS cnt
              FROM core.legal_hold_manifest WHERE released_at IS NULL
            `.execute(govDb);
            return Number(r.rows[0]?.cnt ?? 0);
          },
          getActiveHoldCount: async () => {
            const { sql } = await import("kysely");
            const r = await sql<{ cnt: string }>`
              SELECT COUNT(*)::text AS cnt FROM core.legal_hold
              WHERE released_at IS NULL
            `.execute(govDb);
            return Number(r.rows[0]?.cnt ?? 0);
          },
          getQuotaBreachCount: async () => {
            const { sql } = await import("kysely");
            const r = await sql<{ cnt: string }>`
              SELECT COUNT(*)::text AS cnt FROM core.tenant_resource_quota
              WHERE current_value > limit_value AND is_active = true
            `.execute(govDb);
            return Number(r.rows[0]?.cnt ?? 0);
          },
        }),
        { type: "internal", required: false },
      );
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "[audit-governance] Could not register governance health check",
      );
    }

    // ── Slow Query Handler + Timeline Metrics ──────────────────────
    try {
      const timeline = await c.resolve<ActivityTimelineService>(
        TOKENS.auditTimeline,
      );
      let metrics: AuditMetrics | undefined;
      try {
        metrics = await c.resolve<AuditMetrics>(TOKENS.auditMetrics);
      } catch {
        // Metrics not registered
      }

      if (metrics) {
        timeline.setMetricsCollector(metrics);
      }

      const db = await c.resolve<Kysely<DB>>(TOKENS.db);
      const slowQueryHandler = new AuditSlowQueryHandler(db, metrics, logger);
      timeline.setSlowQueryHandler((durationMs, query) =>
        slowQueryHandler.handle(durationMs, query),
      );
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "[audit-governance] Could not wire slow query handler",
      );
    }

    // ── BullMQ Workers ─────────────────────────────────────────────
    try {
      const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
      const outboxRepo = await c.resolve<AuditOutboxRepo>(
        TOKENS.auditOutboxRepo,
      );
      const auditRepo = await c.resolve<WorkflowAuditRepository>(
        TOKENS.auditWorkflowRepo,
      );

      let dlqManager: AuditDlqManager | undefined;
      try {
        dlqManager = await c.resolve<AuditDlqManager>(TOKENS.auditDlqManager);
      } catch {
        // DLQ not available — drain worker runs without DLQ
      }

      await jobQueue.process(
        "drain-audit-outbox",
        2,
        createDrainAuditOutboxHandler(
          outboxRepo,
          auditRepo,
          logger,
          dlqManager,
        ),
      );

      logger.info("[audit-governance] Drain worker registered (concurrency=2)");
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "[audit-governance] Could not register drain worker",
      );
    }

    // ── Schedule Contributions (for CronScheduler) ───────────────────
    try {
      const jobRegistry = await c.resolve<JobRegistry>(TOKENS.jobRegistry);

      jobRegistry.addSchedule({
        name: "drain-audit-outbox",
        cron: "*/5 * * * *", // every 5 minutes
        jobName: "drain-audit-outbox",
      });
      jobRegistry.addSchedule({
        name: "audit-log-retention",
        cron: "0 2 * * *", // daily at 2 AM
        jobName: "audit-log-retention",
      });
      // Quota measurement: hourly snapshot of tenant resource usage
      jobRegistry.addSchedule({
        name: "quota-measurement",
        cron: "15 * * * *", // 15 minutes past every hour
        jobName: "quota-measurement",
      });
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "[audit-governance] Could not register schedules",
      );
    }

    logger.info("[audit-governance] Module contributed");
  },
};

export const moduleCode = "AUDIT";
export const moduleName = "Audit & Governance";

// Re-export for barrel imports
export * from "./audit-log-retention.job.js";
export { LegalHoldService } from "./domain/legal-hold.service.js";
export { PolicyExplainabilityService } from "./domain/policy-explainability.service.js";
export {
  QuotaEnforcementService,
  quotaMiddleware,
} from "./domain/quota-enforcement.guard.js";
export type {
  QuotaCheckResult,
  QuotaViolation,
  QuotaGuardOptions,
  FailMode,
} from "./domain/quota-enforcement.guard.js";
export {
  GovernanceMetrics,
  createGovernanceHealthChecker,
} from "./observability/governance-metrics.js";
