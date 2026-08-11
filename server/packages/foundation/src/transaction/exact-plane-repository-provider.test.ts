import { describe, expect, it, vi } from "vitest";
import { createExactPlaneRepositoryProvider } from "./exact-plane-repository-provider.js";

describe("exact-plane repository provider", () => {
  it("requires the requested plane and never falls back", () => {
    const studio = { name: "studio" };
    const provider = createExactPlaneRepositoryProvider({ studio });
    expect(provider.require("studio")).toBe(studio);
    expect(() => provider.require("neon")).toThrowError(expect.objectContaining({ code: "EXACT_PLANE_REPOSITORY_UNAVAILABLE", planeKey: "neon", status: 503 }));
  });

  it("reports each plane independently", async () => {
    const studio = {}, neon = {};
    const studioProbe = vi.fn(async () => ({ status: "healthy" as const }));
    const neonProbe = vi.fn(async () => { throw new Error("neon offline"); });
    const provider = createExactPlaneRepositoryProvider({ studio, neon }, { health: { studio: studioProbe, neon: neonProbe } });
    await expect(provider.health("studio")).resolves.toEqual({ status: "healthy" });
    await expect(provider.health("neon")).resolves.toEqual({ status: "unhealthy", message: "neon offline" });
    await expect(provider.health("mesh")).resolves.toMatchObject({ status: "unavailable" });
  });

  it("copies the registry so later mutation cannot redirect selection", () => {
    const source: { studio?: { name: string }; neon?: { name: string } } = { studio: { name: "studio" } };
    const provider = createExactPlaneRepositoryProvider(source);
    source.neon = { name: "late fallback" };
    expect(() => provider.require("neon")).toThrowError(expect.objectContaining({ code: "EXACT_PLANE_REPOSITORY_UNAVAILABLE" }));
  });
});
