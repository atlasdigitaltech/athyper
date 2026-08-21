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

  it("propagates cancellation to repository health dependencies", async () => {
    const controller = new AbortController();
    const repository = {};
    const probe = vi.fn(async (received: object, signal?: AbortSignal) => {
      expect(received).toBe(repository);
      expect(signal).toBe(controller.signal);
      return { status: "healthy" as const };
    });
    const provider = createExactPlaneRepositoryProvider(
      { studio: repository },
      { health: { studio: probe } },
    );

    await expect(provider.health("studio", controller.signal))
      .resolves.toEqual({ status: "healthy" });
  });

  it("does not convert cancellation into an unhealthy result", async () => {
    const reason = new Error("cancelled");
    const signal = AbortSignal.abort(reason);
    const probe = vi.fn();
    const provider = createExactPlaneRepositoryProvider(
      { studio: {} },
      { health: { studio: probe } },
    );

    await expect(provider.health("studio", signal)).rejects.toBe(reason);
    expect(probe).not.toHaveBeenCalled();
  });
});
