import { expect, it, vi } from "vitest";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { loadConfig } from "../../config/environment.js";
import { createContainer } from "../../kernel/container.js";
import { registerWorkerDatabases } from "./databases.js";

it("honors per-plane pool capacity for worker credentials without changing their roles", async () => {
  const config = loadConfig({
    MODE: "worker",
    STUDIO_DATABASE_POOL_MAX: "12",
    DATABASE_POOL_MAX: "7",
    MESH_DATABASE_POOL_MAX: "9",
  });
  const lifecycle = createLifecycle();
  const factories = { studio: vi.fn(), neon: vi.fn(), mesh: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  for (const plane of ["studio", "neon", "mesh"] as const) {
    config.jobs.workerDatabaseUrls[plane] = `postgresql://worker@db/${plane}`;
    factories[plane].mockReturnValue({ database: {}, close });
  }
  registerWorkerDatabases(createContainer(), config, lifecycle, {
    createAthyperDatabase: factories.studio,
    createNeonDatabase: factories.neon,
    createMeshDatabase: factories.mesh,
  });
  for (const [plane, max] of [
    ["studio", 12],
    ["neon", 7],
    ["mesh", 9],
  ] as const) {
    expect(factories[plane]).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        connectionString: `postgresql://worker@db/${plane}`,
        max,
      }),
    );
  }
  await lifecycle.shutdown("test");
  expect(close).toHaveBeenCalledTimes(3);
});
