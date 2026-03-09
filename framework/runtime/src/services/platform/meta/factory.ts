/**
 * META Services Factory
 *
 * Creates and wires all META Engine services for DI container registration.
 */

import {
  DatabaseOverlayRepository,
  SchemaComposerService,
} from "../foundation/overlay-system/index.js";

import { ApprovalTemplateServiceImpl } from "./approval/approval-template.service.js";
import { ApprovalServiceImpl } from "./approval/approval.service.js";
import { ApproverResolverService } from "./approval/approver-resolver.service.js";
import { EntityCapabilitiesService } from "./capabilities/index.js";
import { EntityClassificationServiceImpl } from "./classification/entity-classification.service.js";
import { AuditLoggerService } from "./core/audit-logger.service.js";
import { MetaCompilerService } from "./core/compiler.service.js";
import { MetaEventBusService } from "./core/event-bus.service.js";
import { MetaStoreService } from "./core/meta-store.service.js";
import { PolicyGateService } from "./core/policy-gate.service.js";
import { MetaRegistryService } from "./core/registry.service.js";
import {
  GenericDataAPIService,
  type FieldSecurityFilter,
} from "./data/generic-data-api.service.js";
import {
  ActionDispatcherServiceImpl,
  EntityPageDescriptorServiceImpl,
} from "./descriptor/index.js";
import { LifecycleManagerService } from "./lifecycle/lifecycle-manager.service.js";
import { LifecycleRouteCompilerService } from "./lifecycle/lifecycle-route-compiler.service.js";
import { LifecycleTimerServiceImpl } from "./lifecycle/lifecycle-timer.service.js";
import { HookAdminServiceImpl } from "./lifecycle/hook-admin.service.js";
import { VersionedDocumentServiceImpl } from "./lifecycle/versioned-document.service.js";
import { NumberingEngineService } from "./numbering/numbering-engine.service.js";
import { MetaMetrics } from "./observability/metrics.js";
import { DdlGeneratorService } from "./schema/ddl-generator.service.js";
import { MigrationRunnerService } from "./schema/migration-runner.service.js";
import { PublishService } from "./schema/publish.service.js";
import { SchemaChangeNotifier } from "./schema/schema-change-notifier.js";
import { ValidationEngineService } from "./validation/rule-engine.service.js";

import type { MetaStore } from "./core/meta-store.service.js";
import type { LifecycleDB_Type } from "./data/db-helpers.js";
import type { Logger } from "../../../kernel/logger.js";
import type { IOverlayRepository } from "../foundation/overlay-system/index.js";
import type { DB } from "@athyper/adapter-db";
import type { JobQueue, MetricsRegistry } from "@athyper/core";
import type {
  ActionDispatcher,
  ApprovalService,
  ApprovalTemplateService,
  AuditLogger,
  DdlGenerator,
  EntityClassificationService,
  EntityPageDescriptorService,
  GenericDataAPI,
  LifecycleManager,
  LifecycleRouteCompiler,
  LifecycleTimerService,
  MetaCompiler,
  MetaEventBus,
  MetaRegistry,
  NumberingEngine,
  PolicyGate,
} from "@athyper/core/meta";
import type { Redis } from "ioredis";
import type { Kysely } from "kysely";

/**
 * META Services configuration
 */
export type MetaServicesConfig = {
  /** Kysely database instance */
  db: Kysely<DB>;

  /** Redis cache instance */
  cache: Redis;

  /** Job queue for SLA timer scheduling (optional — SLA timers disabled if absent) */
  jobQueue?: JobQueue;

  /** Compiler cache TTL in seconds (default: 3600) */
  cacheTTL?: number;

  /** Enable caching (default: true) */
  enableCache?: boolean;

  /** Field-level security filter (optional — field masking/redaction disabled if absent) */
  fieldSecurityFilter?: FieldSecurityFilter;

  /** Metrics registry for observability (optional — metrics disabled if absent) */
  metricsRegistry?: MetricsRegistry;
};

/**
 * META Services container
 * Holds all created service instances
 */
export type MetaServices = {
  registry: MetaRegistry;
  compiler: MetaCompiler;
  policyGate: PolicyGate;
  auditLogger: AuditLogger;
  dataAPI: GenericDataAPI;
  metaStore: MetaStore;
  lifecycleRouteCompiler: LifecycleRouteCompiler;
  lifecycleManager: LifecycleManager;
  lifecycleTimerService: LifecycleTimerService;
  classificationService: EntityClassificationService;
  numberingEngine: NumberingEngine;
  approvalService: ApprovalService;
  approvalTemplateService: ApprovalTemplateService;
  ddlGenerator: DdlGenerator;
  migrationRunner: MigrationRunnerService;
  publishService: PublishService;
  schemaChangeNotifier: SchemaChangeNotifier;
  descriptorService: EntityPageDescriptorService;
  actionDispatcher: ActionDispatcher;
  eventBus: MetaEventBus;
  validationEngine: ValidationEngineService;
  overlayRepository: IOverlayRepository;
  schemaComposer: SchemaComposerService;
  hookAdminService: HookAdminServiceImpl;
};

/**
 * Create all META Engine services
 *
 * This factory function creates and wires all META services
 * in the correct dependency order.
 *
 * Usage:
 * ```typescript
 * const metaServices = createMetaServices({
 *   db: dbInstance,
 *   cache: redisInstance,
 * });
 *
 * // Register in DI container
 * container.register(META_TOKENS.registry, metaServices.registry);
 * container.register(META_TOKENS.compiler, metaServices.compiler);
 * // ... etc
 * ```
 */
export function createMetaServices(config: MetaServicesConfig): MetaServices {
  // Create services in dependency order

  // 0. Console logger adapter for overlay system (simple wrapper)
  const consoleLogger: Logger = {
    info: (metaOrMsg: any, msgOrMeta?: any) =>
      console.info(metaOrMsg, msgOrMeta),
    warn: (metaOrMsg: any, msgOrMeta?: any) =>
      console.warn(metaOrMsg, msgOrMeta),
    error: (metaOrMsg: any, msgOrMeta?: any) =>
      console.error(metaOrMsg, msgOrMeta),
    debug: (metaOrMsg: any, msgOrMeta?: any) =>
      console.debug(metaOrMsg, msgOrMeta),
    trace: (metaOrMsg: any, msgOrMeta?: any) =>
      console.trace(metaOrMsg, msgOrMeta),
    fatal: (metaOrMsg: any, msgOrMeta?: any) =>
      console.error("[FATAL]", metaOrMsg, msgOrMeta),
    log: (msg: string) => console.log(msg),
  };

  // 0. Event Bus (no dependencies — created first so other services can subscribe)
  const eventBus = new MetaEventBusService();

  // 0.1. Metrics (optional — create if registry provided)
  const metrics = config.metricsRegistry
    ? new MetaMetrics(config.metricsRegistry)
    : undefined;

  // 1. Registry (no dependencies on other META services)
  const registry = new MetaRegistryService(config.db);

  // 2. Compiler (depends on registry)
  const compiler = new MetaCompilerService(registry, {
    cache: config.cache,
    cacheTTL: config.cacheTTL,
    enableCache: config.enableCache,
  });

  // 3. Audit Logger (no dependencies on other META services)
  const auditLogger = new AuditLoggerService(config.db);

  // 4. Policy Gate (depends on compiler, optionally db for decision logging)
  const policyGate = new PolicyGateService(
    compiler,
    config.db as unknown as LifecycleDB_Type,
  );

  // 5. Entity Classification Service (depends on db)
  const classificationService = new EntityClassificationServiceImpl(
    config.db as unknown as LifecycleDB_Type,
  );

  // 6. Numbering Engine (depends on db)
  const numberingEngine = new NumberingEngineService(
    config.db as unknown as LifecycleDB_Type,
  );

  // 7. Lifecycle Route Compiler (depends on db)
  const lifecycleRouteCompiler = new LifecycleRouteCompilerService(
    config.db as unknown as LifecycleDB_Type,
  );

  // 8. Lifecycle Manager (depends on db, lifecycleRouteCompiler, policyGate)
  const lifecycleManager = new LifecycleManagerService(
    config.db as unknown as LifecycleDB_Type,
    lifecycleRouteCompiler,
    policyGate,
  );

  // 9. Lifecycle Timer Service (depends on db)
  const lifecycleTimerService = new LifecycleTimerServiceImpl(
    config.db as unknown as LifecycleDB_Type,
  );

  // 10. Approval Service (depends on db)
  const approvalService = new ApprovalServiceImpl(
    config.db as unknown as LifecycleDB_Type,
  );

  // 8.1 Versioned Document Service (depends on db)
  const versionedDocService = new VersionedDocumentServiceImpl(
    config.db as unknown as LifecycleDB_Type,
  );

  // 8.2 Hook Admin Service (depends on db)
  const hookAdminService = new HookAdminServiceImpl(
    config.db as unknown as LifecycleDB_Type,
  );

  // 11. Wire circular dependencies
  lifecycleManager.setApprovalService(approvalService);
  lifecycleManager.setEventBus(eventBus);
  lifecycleManager.setVersionedDocumentService(versionedDocService);
  approvalService.setLifecycleManager(lifecycleManager);
  lifecycleManager.setTimerService(lifecycleTimerService);
  lifecycleTimerService.setLifecycleManager(lifecycleManager);

  // 11.1 Wire timer service job queue (if provided)
  if (config.jobQueue) {
    lifecycleTimerService.setJobQueue(config.jobQueue);
  }

  // 11.2 Wire SLA timer job queue (if provided)
  if (config.jobQueue) {
    approvalService.setJobQueue(config.jobQueue);
  }

  // 10.2 Wire approver resolver (condition evaluation + role/group/hierarchy expansion)
  const approverResolver = new ApproverResolverService(
    config.db as unknown as LifecycleDB_Type,
    config.cache,
  );
  approvalService.setApproverResolver(approverResolver);

  // 10.3 Approval Template Service (depends on db, cache, approverResolver)
  const approvalTemplateService = new ApprovalTemplateServiceImpl(
    config.db as unknown as LifecycleDB_Type,
    config.cache,
    approverResolver,
  );

  // 10.4 Overlay Repository (depends on db)
  const overlayRepository = new DatabaseOverlayRepository(config.db as any);

  // 10.4.1 Schema Composer (depends on overlayRepository)
  const schemaComposer = new SchemaComposerService(
    overlayRepository,
    consoleLogger,
  );

  // 10.5 Validation Engine (depends on compiler, registry, cache, db)
  const validationEngine = new ValidationEngineService(
    compiler,
    registry,
    config.cache,
    config.db,
  );

  // 11. Generic Data API (depends on compiler, policyGate, auditLogger, lifecycleManager, classificationService, numberingEngine, validationEngine, registry, fieldSecurityFilter)
  const dataAPI = new GenericDataAPIService(
    config.db,
    compiler,
    policyGate,
    auditLogger,
    lifecycleManager,
    classificationService,
    numberingEngine,
    validationEngine,
    registry,
    config.fieldSecurityFilter,
  );

  // 11.3 Wire GenericDataAPI to timer service (for condition evaluation)
  lifecycleTimerService.setGenericDataAPI(dataAPI);

  // 8. MetaStore (depends on registry, compiler, auditLogger)
  const metaStore = new MetaStoreService(registry, compiler, auditLogger);

  // 9. DDL Generator (no dependencies - pure transformation service)
  const ddlGenerator = new DdlGeneratorService();

  // 10. Migration Runner (depends on db, registry, compiler, ddlGenerator)
  const migrationRunner = new MigrationRunnerService({
    db: config.db,
    registry,
    compiler,
    ddlGenerator,
    mode: "dev",
  });

  // 11. Schema Change Notifier (depends on Redis)
  const schemaChangeNotifier = new SchemaChangeNotifier(config.cache);

  // 12. Publish Service (depends on db, registry, compiler, ddlGenerator, migrationRunner, notifier)
  const publishService = new PublishService(
    config.db,
    registry,
    compiler,
    ddlGenerator,
    migrationRunner,
    schemaChangeNotifier,
  );

  // 12.5 Entity Capabilities Service (depends on db)
  const capabilitiesService = new EntityCapabilitiesService(config.db);

  // 13. Entity Page Descriptor Service (depends on compiler, classificationService, lifecycleManager, approvalService, policyGate, capabilitiesService)
  const descriptorService = new EntityPageDescriptorServiceImpl(
    compiler,
    classificationService,
    lifecycleManager,
    approvalService,
    policyGate,
    capabilitiesService,
  );

  // 14. Action Dispatcher (depends on lifecycleManager, approvalService, dataAPI)
  const actionDispatcher = new ActionDispatcherServiceImpl(
    lifecycleManager,
    approvalService,
    dataAPI,
  );

  // 15. Wire metrics to all instrumented services (late binding)
  if (metrics) {
    compiler.setMetrics(metrics);
    validationEngine.setMetrics(metrics);
    policyGate.setMetrics(metrics);
    lifecycleManager.setMetrics(metrics);
    dataAPI.setMetrics(metrics);
  }

  return {
    registry,
    compiler,
    policyGate,
    auditLogger,
    dataAPI,
    metaStore,
    lifecycleRouteCompiler,
    lifecycleManager,
    lifecycleTimerService,
    classificationService,
    numberingEngine,
    approvalService,
    approvalTemplateService,
    ddlGenerator,
    migrationRunner,
    publishService,
    schemaChangeNotifier,
    descriptorService,
    actionDispatcher,
    eventBus,
    validationEngine,
    overlayRepository,
    schemaComposer,
    hookAdminService,
  };
}

/**
 * Register META services in DI container
 *
 * Helper function to register all META services using META_TOKENS.
 *
 * Usage:
 * ```typescript
 * import { META_TOKENS } from "@athyper/core/meta";
 * import { registerMetaServices } from "./services/meta/factory";
 *
 * registerMetaServices(container, {
 *   db: dbInstance,
 *   cache: redisInstance,
 * });
 * ```
 */
export function registerMetaServices(
  // Generic container interface (works with any DI container)
  container: {
    register<T>(token: string, instance: T): void;
  },
  config: MetaServicesConfig,
): MetaServices {
  const services = createMetaServices(config);

  // Register services with META_TOKENS
  // Note: We can't import META_TOKENS here as it would create circular dependency
  // Services should be registered by the kernel using META_TOKENS directly

  return services;
}
