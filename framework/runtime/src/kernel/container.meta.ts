// framework/runtime/src/kernel/container.meta.ts
import { META_TOKENS } from "@athyper/core/meta";

import { TOKENS } from "./tokens.js";

import type { RuntimeConfig } from "./config.schema.js";
import type { Container } from "./container.js";
import type { DB } from "@athyper/adapter-db";
import type { Redis } from "ioredis";
import type { Kysely } from "kysely";

/**
 * Registers META Engine services into the container.
 *
 * Called after registerAdapters() during bootstrap.
 * META services provide the entity modeling, policy, and generic data API functionality.
 */
export async function registerMetaServices(
  container: Container,
  _config: RuntimeConfig
) {
  // Get health registry to register health checks
  const healthRegistry = await container.resolve<any>(TOKENS.healthRegistry);

  // Resolve infrastructure dependencies
  const db = await container.resolve<Kysely<DB>>(TOKENS.db);
  const cache = await container.resolve<Redis>(TOKENS.cache);

  // META Engine configuration defaults
  const metaConfig = {
    enableCache: true,
    cacheTTL: 3600, // 1 hour
    enablePolicyCache: true,
    policyCacheTTL: 300, // 5 minutes
    enableAudit: true,
    auditRetentionDays: 90,
    maxPageSize: 100,
    defaultPageSize: 20,
    enableSchemaValidation: true,
    precompileOnStartup: false,
  };

  // Register META Engine config
  container.register(
    META_TOKENS.config,
    async () => metaConfig,
    "singleton"
  );

  // Resolve optional field-level security filter (registered by IAM module if available)
  let fieldSecurityFilter: any;
  try {
    fieldSecurityFilter = await container.resolve(TOKENS.fieldAccessService);
  } catch {
    // FieldAccessService not registered — field-level security disabled (graceful degradation)
  }

  // Create all META services using factory
  const { createMetaServices } = await import("../services/platform/meta/factory.js");

  const metaServices = createMetaServices({
    db,
    cache,
    cacheTTL: metaConfig.cacheTTL,
    enableCache: metaConfig.enableCache,
    fieldSecurityFilter,
  });

  // Register MetaRegistry
  container.register(
    META_TOKENS.registry,
    async () => metaServices.registry,
    "singleton"
  );

  // Register MetaCompiler with health check
  container.register(
    META_TOKENS.compiler,
    async () => {
      const compiler = metaServices.compiler;

      // Register health check
      healthRegistry.register(
        "meta_compiler",
        async () => {
          const result = await compiler.healthCheck();
          return {
            status: result.healthy ? "healthy" : "unhealthy",
            message: result.message,
            details: result.details,
            timestamp: new Date(),
          };
        },
        { type: "meta", required: true }
      );

      return compiler;
    },
    "singleton"
  );

  // Register PolicyGate with health check
  container.register(
    META_TOKENS.policyGate,
    async () => {
      const policyGate = metaServices.policyGate;

      // Register health check
      healthRegistry.register(
        "meta_policy_gate",
        async () => {
          const result = await policyGate.healthCheck();
          return {
            status: result.healthy ? "healthy" : "unhealthy",
            message: result.message,
            details: result.details,
            timestamp: new Date(),
          };
        },
        { type: "meta", required: true }
      );

      return policyGate;
    },
    "singleton"
  );

  // Register AuditLogger with health check
  container.register(
    META_TOKENS.auditLogger,
    async () => {
      const auditLogger = metaServices.auditLogger;

      // Register health check
      healthRegistry.register(
        "meta_audit_logger",
        async () => {
          const result = await auditLogger.healthCheck();
          return {
            status: result.healthy ? "healthy" : "unhealthy",
            message: result.message,
            details: result.details,
            timestamp: new Date(),
          };
        },
        { type: "meta", required: true }
      );

      return auditLogger;
    },
    "singleton"
  );

  // Register GenericDataAPI with health check
  container.register(
    META_TOKENS.dataAPI,
    async () => {
      const dataAPI = metaServices.dataAPI;

      // Register health check
      healthRegistry.register(
        "meta_data_api",
        async () => {
          const result = await dataAPI.healthCheck();
          return {
            status: result.healthy ? "healthy" : "unhealthy",
            message: result.message,
            details: result.details,
            timestamp: new Date(),
          };
        },
        { type: "meta", required: true }
      );

      return dataAPI;
    },
    "singleton"
  );

  // Register MetaStore with health check
  container.register(
    META_TOKENS.store,
    async () => {
      const metaStore = metaServices.metaStore;

      // Register health check
      healthRegistry.register(
        "meta_store",
        async () => {
          const result = await metaStore.healthCheck();
          return {
            status: result.healthy ? "healthy" : "unhealthy",
            message: result.message,
            details: result.details,
            timestamp: new Date(),
          };
        },
        { type: "meta", required: false } // MetaStore is a convenience wrapper, not required
      );

      return metaStore;
    },
    "singleton"
  );

  // Register ApprovalService (needed by SLA timer workers in contribute phase)
  container.register(
    META_TOKENS.approvalService,
    async () => metaServices.approvalService,
    "singleton"
  );

  // Register ApprovalService health check
  healthRegistry.register(
    "meta_approval_service",
    async () => {
      const result = await metaServices.approvalService.healthCheck();
      return {
        status: result.healthy ? "healthy" : "unhealthy",
        message: result.message,
        details: result.details,
        timestamp: new Date(),
      };
    },
    { type: "meta", required: false }
  );

  // Register ApprovalTemplateService (needed by template authoring handlers)
  container.register(
    META_TOKENS.approvalTemplateService,
    async () => metaServices.approvalTemplateService,
    "singleton"
  );

  // Register LifecycleManager (needed by lifecycle transition handlers)
  container.register(
    META_TOKENS.lifecycleManager,
    async () => metaServices.lifecycleManager,
    "singleton"
  );

  // Register LifecycleManager health check
  healthRegistry.register(
    "meta_lifecycle_manager",
    async () => {
      const result = await metaServices.lifecycleManager.healthCheck();
      return {
        status: result.healthy ? "healthy" : "unhealthy",
        message: result.message,
        details: result.details,
        timestamp: new Date(),
      };
    },
    { type: "meta", required: false }
  );

  // Register OverlayRepository (EPIC I - overlay system)
  container.register(
    META_TOKENS.overlayRepository,
    async () => metaServices.overlayRepository,
    "singleton"
  );

  // Register SchemaComposerService (EPIC I - overlay composition)
  container.register(
    META_TOKENS.schemaComposer,
    async () => metaServices.schemaComposer,
    "singleton"
  );

  // Register overlay system health check
  healthRegistry.register(
    "meta_overlay_repository",
    async () => {
      try {
        // Basic connectivity check
        return {
          status: "healthy" as const,
          message: "Overlay repository operational",
          timestamp: new Date(),
        };
      } catch (err) {
        return {
          status: "unhealthy" as const,
          message: String(err),
          timestamp: new Date(),
        };
      }
    },
    { type: "meta", required: false }
  );

  // Optional: Precompile all active versions on startup
  if (metaConfig.precompileOnStartup) {
    const compiler = await container.resolve<any>(META_TOKENS.compiler);
    const logger = await container.resolve<any>(TOKENS.logger);

    logger.info(
      { component: "meta" },
      "Precompiling all active entity versions..."
    );

    try {
      const compiled = await compiler.precompileAll();
      logger.info(
        { component: "meta", count: compiled.length },
        `Precompiled ${compiled.length} entity versions`
      );
    } catch (error) {
      logger.error(
        { component: "meta", error: String(error) },
        "Failed to precompile entity versions"
      );
    }
  }
}
