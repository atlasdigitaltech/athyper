import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { loadConfig } from "../../../config/environment.js";
import {
  readDeploymentProfile,
  type DeploymentPlane,
  type ProcessRole,
} from "../../../config/deployment-profile.js";
import { selectDeploymentEnvironment } from "../../../config/deployment-environment.js";
import { createRegistrationPlan } from "../../../kernel/registration-plan.js";
import { createContainer } from "../../../kernel/container.js";
import { registerDatabases, registerWorkerDatabases } from "../databases.js";
import { selectDatabaseConfiguration } from "../database-selection.js";

const mocks = vi.hoisted(() => ({ qualify: vi.fn(), writers: vi.fn() }));
vi.mock("../../database-qualification.js", () => ({
  qualifyRuntimePlaneDatabase: mocks.qualify,
}));
vi.mock("../authorization-writer-databases.js", () => ({
  createAuthorizationWriterDatabases: mocks.writers,
}));

const planes = ["studio", "neon", "mesh"] as const;
function fixture(role: ProcessRole = "worker") {
  const config = loadConfig({ MODE: role });
  config.studioDatabase.connectionString =
    "postgresql://runtime@db/athyper_studio";
  config.database.connectionString = "postgresql://runtime@db/athyper_neon";
  config.meshDatabase.connectionString = "postgresql://runtime@db/athyper_mesh";
  for (const plane of planes) {
    config.jobs.workerDatabaseUrls[plane] =
      `postgresql://worker@db/athyper_${plane}`;
    config.jobs.invalidationListenerDatabaseUrls[plane] =
      `postgresql://listener@db/athyper_${plane}`;
  }
  const created: Array<{
    database: { plane: DeploymentPlane };
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const factory = (plane: DeploymentPlane) =>
    vi.fn(() => {
      const adapter = {
        database: { plane },
        close: vi.fn().mockResolvedValue(undefined),
      };
      created.push(adapter);
      return adapter as never;
    });
  const factories = {
    studio: factory("studio"),
    neon: factory("neon"),
    mesh: factory("mesh"),
  };
  return {
    config,
    created,
    factories,
    dependencies: {
      createAthyperDatabase: factories.studio,
      createNeonDatabase: factories.neon,
      createMeshDatabase: factories.mesh,
    },
  };
}

beforeEach(() => {
  mocks.qualify.mockReset().mockResolvedValue(undefined);
  mocks.writers.mockReset();
});

describe("deployment resource isolation prerequisites", () => {
  it.each(
    planes.flatMap((plane) =>
      (["api", "worker", "scheduler"] as const).map((role) => ({
        plane,
        role,
      })),
    ),
  )(
    "constructs only $plane pools for $role even when every URL is configured",
    async ({ plane, role }) => {
      const plan = createRegistrationPlan(
        readDeploymentProfile(
          { MODE: role, HOST_DEPLOYMENT_PROFILE: plane },
          role,
        ),
      );
      const { config, factories, created, dependencies } = fixture(role);
      const before = structuredClone(config),
        lifecycle = createLifecycle(),
        container = createContainer();
      registerDatabases(container, config, lifecycle, dependencies, plan);
      registerWorkerDatabases(container, config, lifecycle, dependencies, plan);
      for (const candidate of planes)
        expect(factories[candidate]).toHaveBeenCalledTimes(
          candidate === plane ? (role === "worker" ? 2 : 1) : 0,
        );
      expect(config).toEqual(before);
      expect(mocks.qualify).not.toHaveBeenCalled();
      await lifecycle.signalReady({ failOnError: true });
      expect(mocks.qualify).toHaveBeenCalledTimes(created.length);
      for (const adapter of created)
        expect(mocks.qualify).toHaveBeenCalledWith(adapter.database, plane);
      await lifecycle.shutdown("test");
      for (const adapter of created)
        expect(adapter.close).toHaveBeenCalledOnce();
    },
  );

  it("adds review read connections without granting worker, writer, or listener access to coordination planes", async () => {
    const plan = createRegistrationPlan(
      readDeploymentProfile(
        {
          MODE: "worker",
          HOST_DEPLOYMENT_PROFILE: "mesh",
          ENTITY_RELEASE_REVIEW_CONFIG_PATH: "/review.json",
        },
        "worker",
      ),
    );
    const { config, dependencies, factories, created } = fixture();
    config.wave0.authorizationWriterConnectionsPath = "/writers.json";
    const writers = {
      databases: {},
      qualify: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mocks.writers.mockReturnValue(writers);
    const container = createContainer(),
      lifecycle = createLifecycle();
    registerDatabases(container, config, lifecycle, dependencies, plan);
    registerWorkerDatabases(container, config, lifecycle, dependencies, plan);
    expect(factories.studio).toHaveBeenCalledOnce();
    expect(factories.neon).toHaveBeenCalledOnce();
    expect(factories.mesh).toHaveBeenCalledTimes(2);
    expect(mocks.writers).toHaveBeenCalledWith("/writers.json", ["mesh"]);
    expect(plan.servedPlanes).toEqual(["mesh"]);
    const selected = selectDatabaseConfiguration(config, plan);
    expect(selected.jobs.workerDatabaseUrls).toEqual({
      mesh: config.jobs.workerDatabaseUrls.mesh,
    });
    expect(selected.jobs.invalidationListenerDatabaseUrls).toEqual({
      mesh: config.jobs.invalidationListenerDatabaseUrls.mesh,
    });
    await lifecycle.signalReady({ failOnError: true });
    expect(writers.qualify).toHaveBeenCalledOnce();
    await lifecycle.shutdown("test");
    expect(writers.close).toHaveBeenCalledOnce();
    for (const adapter of created) expect(adapter.close).toHaveBeenCalledOnce();
  });

  it("filters unserved workload credentials before config parsing without removing review read URLs", () => {
    const plan = createRegistrationPlan(
      readDeploymentProfile(
        {
          MODE: "worker",
          HOST_DEPLOYMENT_PROFILE: "mesh",
          ENTITY_RELEASE_REVIEW_CONFIG_PATH: "/review.json",
        },
        "worker",
      ),
    );
    const environment = {
      STUDIO_DATABASE_URL: "studio",
      DATABASE_URL: "neon",
      MESH_DATABASE_URL: "mesh",
      STUDIO_WORKER_DATABASE_URL: "studio-worker",
      ATHYPER_PLATFORM_WORKER_DATABASE_URL: "studio-legacy-worker",
      NEON_WORKER_DATABASE_URL: "neon-worker",
      DATABASE_ADMIN_URL: "neon-legacy-worker",
      MESH_WORKER_DATABASE_URL: "mesh-worker",
      STUDIO_INVALIDATION_LISTENER_DATABASE_URL: "studio-listener",
      NEON_INVALIDATION_LISTENER_DATABASE_URL: "neon-listener",
      MESH_INVALIDATION_LISTENER_DATABASE_URL: "mesh-listener",
      KEYCLOAK_AUDIENCE: "test-audience",
    };
    const before = { ...environment };
    expect(selectDeploymentEnvironment(environment, plan)).toEqual({
      STUDIO_DATABASE_URL: "studio",
      DATABASE_URL: "neon",
      MESH_DATABASE_URL: "mesh",
      MESH_WORKER_DATABASE_URL: "mesh-worker",
      MESH_INVALIDATION_LISTENER_DATABASE_URL: "mesh-listener",
      KEYCLOAK_AUDIENCE: "test-audience",
    });
    expect(environment).toEqual(before);
  });

  it("fails readiness on a mismatched database and retains cleanup ownership", async () => {
    const { config, dependencies, created } = fixture("api");
    const plan = createRegistrationPlan(
      readDeploymentProfile({ HOST_DEPLOYMENT_PROFILE: "neon" }, "api"),
    );
    const lifecycle = createLifecycle();
    registerDatabases(createContainer(), config, lifecycle, dependencies, plan);
    mocks.qualify.mockRejectedValueOnce(new Error("DATABASE_PLANE_MISMATCH"));
    await expect(lifecycle.signalReady({ failOnError: true })).rejects.toThrow(
      "Startup initialization failed",
    );
    await lifecycle.shutdown("failed-startup");
    expect(created[0]!.close).toHaveBeenCalledOnce();
  });
});
