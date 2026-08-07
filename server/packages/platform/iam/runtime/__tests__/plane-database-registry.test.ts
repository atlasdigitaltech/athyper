import { describe, expect, it, vi } from "vitest";

import { PlaneDatabaseRegistry } from "../plane-database-registry.js";

function db(databaseName: string, databasePlane: string) {
  return {
    executeQuery: vi.fn().mockResolvedValue({
      rows: [{ database_name: databaseName, database_plane: databasePlane }],
    }),
    getExecutor() {
      return this;
    },
    transformQuery(node: unknown) {
      return node;
    },
    compileQuery(node: unknown) {
      return node;
    },
  };
}

describe("PlaneDatabaseRegistry", () => {
  it("maps the Admin runtime to the Athyper database plane", () => {
    const admin = db("athyper_platform", "athyper");
    const registry = new PlaneDatabaseRegistry({
      admin: admin as never,
      neon: db("athyper_neon", "neon") as never,
      mesh: db("athyper_mesh", "mesh") as never,
    });

    expect(registry.forPlane("admin")).toMatchObject({
      databasePlane: "athyper",
      expectedDatabaseName: "athyper_platform",
      db: admin,
    });
  });

  it("rejects a cross-plane database binding during readiness", async () => {
    const registry = new PlaneDatabaseRegistry({
      admin: db("athyper_neon", "neon") as never,
      neon: db("athyper_neon", "neon") as never,
      mesh: db("athyper_mesh", "mesh") as never,
    });

    await expect(registry.assertReady()).rejects.toThrow("PLANE_DATABASE_MISMATCH:admin");
  });
});
