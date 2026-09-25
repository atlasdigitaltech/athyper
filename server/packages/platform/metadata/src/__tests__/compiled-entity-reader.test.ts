import { describe, expect, it, vi } from "vitest";
import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
  type CompiledEntityArtifactV2,
  type CompiledEntityReleaseEnvelopeV2,
} from "@athyper/server-contract-publication";
import {
  PinnedCompiledEntityReader,
  type CompiledEntityArtifactCache,
  type CompiledEntityReleaseSource,
} from "../index.js";

const hash = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const coordinate = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" as const, entityCode: "business_partner" };
const artifacts = [
  artifact("business_partner/core", "core", { defaultsProfile: "platform.core-field-defaults.v1", defaultsProfileRef: "platform/core-field-defaults.v1.json", fieldDefaults: { customizationPolicy: "locked" } }),
  artifact("business_partner/presentation.detail", "presentation_surface", { surfaceKey: "detail_360" }),
  artifact("business_partner/presentation.section.overview", "presentation_section", { sectionKey: "overview" }),
  artifact("platform/core-field-defaults.v1", "core", { coreKind: "field_defaults_profile", profileKey: "platform.core-field-defaults.v1", fieldDefaults: { readPolicy: "authorized_projection", customizationPolicy: "facet_only" } }, "platform"),
];
const release = parseCompiledEntityReleaseEnvelope({
  schema: "athyper.compiled-entity-release/2.0-draft",
  contractStatus: "unsigned_review_only",
  releaseId: "bp-release-1",
  releaseNo: 1,
  targetPlanes: ["neon"],
  artifacts: artifacts.map((item) => ({ artifactKey: item.artifactKey, artifactType: item.artifactType, entityCode: item.entityCode, ref: `${item.artifactKey}.json`, hash: item.artifactHash })),
  externalDependencies: [],
  signature: {},
  releaseHash: hash("a"),
});

describe("pinned compiled entity reader", () => {
  it("loads only a Core, requested surface and named defaults profile, then reuses cached fragments", async () => {
    const source = sourceFor();
    const reader = new PinnedCompiledEntityReader({ source, cache: memoryCache() });
    const first = await reader.surfaceModel(coordinate, "detail");
    const second = await reader.surfaceModel(coordinate, "detail");
    expect(first?.release.release.releaseId).toBe("bp-release-1");
    expect(first?.core.content.fieldDefaults).toEqual({ readPolicy: "authorized_projection", customizationPolicy: "locked" });
    expect(second?.surface.artifactKey).toBe("business_partner/presentation.detail");
    expect(source.findAdmittedRelease).toHaveBeenCalledTimes(2);
    expect(source.findArtifact).toHaveBeenCalledTimes(3);
  });

  it("does not reuse an unpinned cached head after activation or withdrawal", async () => {
    const source = sourceFor();
    const cache = memoryCache();
    await cache.setRelease(coordinate, release, 60000);
    const reader = new PinnedCompiledEntityReader({ source, cache });
    expect((await reader.resolve(coordinate))?.release.releaseHash).toBe(release.releaseHash);
    source.findAdmittedRelease.mockResolvedValueOnce({ ...release, releaseHash: hash("d"), releaseNo: 2 });
    expect((await reader.resolve(coordinate))?.release.releaseHash).toBe(hash("d"));
    source.findAdmittedRelease.mockResolvedValueOnce(null);
    expect(await reader.resolve(coordinate)).toBeNull();
  });

  it("falls back to the verified source when the cache is unavailable", async () => {
    const source = sourceFor();
    const unavailable: CompiledEntityArtifactCache = {
      getRelease: async () => { throw new Error("redis unavailable"); },
      setRelease: async () => { throw new Error("redis unavailable"); },
      getArtifact: async () => { throw new Error("redis unavailable"); },
      setArtifact: async () => { throw new Error("redis unavailable"); },
    };
    const reader = new PinnedCompiledEntityReader({ source, cache: unavailable });
    await expect(reader.surfaceModel(coordinate, "detail")).resolves.toMatchObject({ surface: { artifactKey: "business_partner/presentation.detail" } });
    expect(source.findAdmittedRelease).toHaveBeenCalledOnce();
    expect(source.findArtifact).toHaveBeenCalledTimes(3);
  });

  it("keeps a section read on the originally admitted release pin", async () => {
    const source = sourceFor();
    const reader = new PinnedCompiledEntityReader({ source });
    const pinned = await reader.resolve(coordinate);
    await reader.core(pinned!);
    await reader.section(pinned!, "overview");
    expect(source.findArtifact.mock.calls.map(([input]) => input.release.releaseId)).toEqual(["bp-release-1", "bp-release-1"]);
    expect(source.findArtifact.mock.calls.every(([input]) => input.coordinate === pinned!.coordinate)).toBe(true);
  });
});

function artifact(
  artifactKey: string,
  artifactType: "core" | "presentation_surface" | "presentation_section",
  content: Record<string, unknown>,
  entityCode = "business_partner",
): CompiledEntityArtifactV2 {
  return parseCompiledEntityArtifact({
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "draft_for_review",
    artifactType,
    artifactKey,
    entityCode,
    plane: "neon",
    dependencies: [],
    artifactHash: hash(artifactType === "core" ? "a" : artifactType === "presentation_surface" ? "b" : "c"),
    ...content,
  });
}

function sourceFor(): CompiledEntityReleaseSource & { findAdmittedRelease: ReturnType<typeof vi.fn>; findArtifact: ReturnType<typeof vi.fn> } {
  return {
    findAdmittedRelease: vi.fn(async () => release),
    findArtifact: vi.fn(async (input) => artifacts.find((item) => item.artifactKey === input.entry.artifactKey) ?? null),
  };
}

function memoryCache(): CompiledEntityArtifactCache {
  let cachedRelease: CompiledEntityReleaseEnvelopeV2 | undefined;
  const cachedArtifacts = new Map<string, CompiledEntityArtifactV2>();
  return {
    async getRelease() { return cachedRelease; },
    async setRelease(_coordinate, release) { cachedRelease = release; },
    async getArtifact(input) { return cachedArtifacts.get(input.entry.artifactKey); },
    async setArtifact(input, artifact) { cachedArtifacts.set(input.entry.artifactKey, artifact); },
  };
}
