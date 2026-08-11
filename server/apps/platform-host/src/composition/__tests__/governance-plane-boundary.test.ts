import { describe, expect, it, vi } from "vitest";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

describe("host governance plane boundary", () => {
  it("returns Neon unavailable even while Studio and Mesh are healthy", async () => {
    const studio = { plane: "studio" } as const;
    const mesh = { plane: "mesh" } as const;
    const probe = vi.fn(async () => ({ status: "healthy" as const }));
    const provider = createExactPlaneRepositoryProvider({ studio, mesh }, { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE", health: { studio: probe, mesh: probe } });
    expect(provider.require("studio")).toBe(studio);
    expect(provider.require("mesh")).toBe(mesh);
    expect(() => provider.require("neon")).toThrowError(expect.objectContaining({ code: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE", planeKey: "neon", status: 503 }));
    await expect(provider.health("studio")).resolves.toEqual({ status: "healthy" });
    await expect(provider.health("mesh")).resolves.toEqual({ status: "healthy" });
    await expect(provider.health("neon")).resolves.toMatchObject({ status: "unavailable" });
  });

  it("does not redirect an unhealthy plane or fail healthy plane readiness", async () => {
    const studio = { plane: "studio" } as const;
    const neon = { plane: "neon" } as const;
    const mesh = { plane: "mesh" } as const;
    const provider = createExactPlaneRepositoryProvider({ studio, neon, mesh }, { health: {
      studio: async () => { throw new Error("studio offline"); },
      neon: async () => ({ status: "healthy" }),
      mesh: async () => ({ status: "healthy" }),
    } });
    await expect(provider.health("studio")).resolves.toEqual({ status: "unhealthy", message: "studio offline" });
    await expect(provider.health("neon")).resolves.toEqual({ status: "healthy" });
    await expect(provider.health("mesh")).resolves.toEqual({ status: "healthy" });
    expect(provider.require("studio")).toBe(studio);
    expect(provider.require("neon")).toBe(neon);
  });
});
