import { describe, expect, it } from "vitest";
import { HealthRegistry } from "../index.js";

describe("HealthRegistry", () => {
  it("registers, replaces, lists, and removes checks", async () => {
    const registry = new HealthRegistry();
    registry.register("database", async () => ({ status: "degraded" }));
    registry.register("database", async () => ({ status: "healthy" }));

    expect(registry.list()).toEqual(["database"]);
    const entry = registry.entries()[0];
    expect(entry).toBeDefined();
    await expect(entry?.[1]()).resolves.toEqual({ status: "healthy" });

    registry.deregister("database");
    expect(registry.list()).toEqual([]);
  });
});
