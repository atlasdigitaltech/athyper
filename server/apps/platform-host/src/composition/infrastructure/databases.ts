import { createAuthorizationWriterDatabases } from "./authorization-writer-databases.js";
import { selectDatabaseConfiguration } from "./database-selection.js";
import type { RegistrationPlan } from "../../kernel/registration-plan.js";
import { createAthyperDatabaseAdapter } from "@athyper/server-adapter-db-athyper";
import { createMeshDatabaseAdapter } from "@athyper/server-adapter-db-mesh";
import { createNeonDatabaseAdapter } from "@athyper/server-adapter-db-neon";
import { qualifyRuntimePlaneDatabase } from "../database-qualification.js";
import { tryGetRequestContext } from "@athyper/server-foundation/context";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type DatabasesRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  "createNeonDatabase" | "createAthyperDatabase" | "createMeshDatabase"
>;

const DEFAULT_DEPENDENCIES: DatabasesRegistrationDependencies = {
  createNeonDatabase: createNeonDatabaseAdapter,
  createAthyperDatabase: createAthyperDatabaseAdapter,
  createMeshDatabase: createMeshDatabaseAdapter,
};

export function registerDatabases(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<DatabasesRegistrationDependencies> = {},
  plan?: RegistrationPlan,
) {
  config = selectDatabaseConfiguration(config, plan);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  if (config.database.connectionString) {
    const neonDatabase = dependencies.createNeonDatabase({
      connectionString: config.database.connectionString,
      max: config.database.poolMax,
      actorProvider: () => {
        const context = tryGetRequestContext();
        if (!context?.tenantId || !context.principalId) return undefined;
        return {
          tenantId: context.tenantId,
          principalId: context.principalId,
        };
      },
      observer: poolObserver("neon", container),
    });
    container.adapters.neonDatabase = neonDatabase;
    lifecycle.onReady(async () => {
      await qualifyRuntimePlaneDatabase(neonDatabase.database as never, "neon");
    });
    lifecycle.onShutdown(() => neonDatabase.close());
  }

  if (config.studioDatabase.connectionString) {
    const athyperDatabase = dependencies.createAthyperDatabase({
      connectionString: config.studioDatabase.connectionString,
      max: config.studioDatabase.poolMax,
      actorProvider: () => {
        const context = tryGetRequestContext();
        if (!context?.tenantId || !context.principalId) return undefined;
        return { tenantId: context.tenantId, principalId: context.principalId };
      },
      observer: poolObserver("studio", container),
    });
    container.adapters.athyperDatabase = athyperDatabase;
    lifecycle.onReady(async () => {
      await qualifyRuntimePlaneDatabase(
        athyperDatabase.database as never,
        "studio",
      );
    });
    lifecycle.onShutdown(() => athyperDatabase.close());
  }

  if (config.meshDatabase.connectionString) {
    const meshDatabase = dependencies.createMeshDatabase({
      connectionString: config.meshDatabase.connectionString,
      max: config.meshDatabase.poolMax,
      actorProvider: () => {
        const context = tryGetRequestContext();
        if (!context?.tenantId || !context.principalId) return undefined;
        return { tenantId: context.tenantId, principalId: context.principalId };
      },
      observer: poolObserver("mesh", container),
    });
    container.adapters.meshDatabase = meshDatabase;
    lifecycle.onReady(async () => {
      await qualifyRuntimePlaneDatabase(meshDatabase.database as never, "mesh");
    });
    lifecycle.onShutdown(() => meshDatabase.close());
  }

  if (config.wave0.authorizationWriterConnectionsPath) {
    const writers = createAuthorizationWriterDatabases(
      config.wave0.authorizationWriterConnectionsPath,
      plan?.servedPlanes,
    );
    container.adapters.authorizationWriterDatabases = writers.databases;
    lifecycle.onReady(() => writers.qualify());
    lifecycle.onShutdown(() => writers.close());
  }
}

export function registerWorkerDatabases(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<DatabasesRegistrationDependencies> = {},
  plan?: RegistrationPlan,
) {
  config = selectDatabaseConfiguration(config, plan);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  if (config.mode === "worker" && config.jobs.workerDatabaseUrls.neon) {
    const database = dependencies.createNeonDatabase({
      connectionString: config.jobs.workerDatabaseUrls.neon,
      max: 2,
      observer: poolObserver("neon", container),
    });
    container.adapters.jobNeonDatabase = database;
    lifecycle.onReady(async () => {
      await qualifyRuntimePlaneDatabase(database.database as never, "neon");
    });
    lifecycle.onShutdown(() => database.close());
  }
  if (config.mode === "worker" && config.jobs.workerDatabaseUrls.studio) {
    const database = dependencies.createAthyperDatabase({
      connectionString: config.jobs.workerDatabaseUrls.studio,
      max: 2,
      observer: poolObserver("studio", container),
    });
    container.adapters.jobAthyperDatabase = database;
    lifecycle.onReady(async () => {
      await qualifyRuntimePlaneDatabase(database.database as never, "studio");
    });
    lifecycle.onShutdown(() => database.close());
  }
  if (config.mode === "worker" && config.jobs.workerDatabaseUrls.mesh) {
    const database = dependencies.createMeshDatabase({
      connectionString: config.jobs.workerDatabaseUrls.mesh,
      max: 2,
      observer: poolObserver("mesh", container),
    });
    container.adapters.jobMeshDatabase = database;
    lifecycle.onReady(async () => {
      await qualifyRuntimePlaneDatabase(database.database as never, "mesh");
    });
    lifecycle.onShutdown(() => database.close());
  }
}

function poolObserver(plane: "studio" | "neon" | "mesh", container: Container) {
  const gauge = container.adapters.openTelemetry?.metrics?.gauge(
    "athyper_db_pool_connections",
    "PostgreSQL pool connections by state",
  );
  return {
    onPoolError(error: Error) {
      console.error(`[database] ${plane}_pool_error`, error.message);
    },
    onPoolStats(stats: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
      max: number;
    }) {
      for (const [state, value] of [
        ["total", stats.totalCount],
        ["idle", stats.idleCount],
        ["active", Math.max(0, stats.totalCount - stats.idleCount)],
        ["waiting", stats.waitingCount],
        ["max", stats.max],
      ] as const) {
        gauge?.set(value, { plane, state, capability: "database" });
      }
    },
  };
}
