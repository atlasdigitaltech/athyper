import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { AtlasDataGateway } from "../../atlas-data-gateway.js";
import { AtlasRetrievalService } from "../atlas-retrieval.service.js";

const context = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  principalId: "20000000-0000-4000-8000-000000000001",
  planeKey: "neon",
  realmKey: "athyper",
  requestId: "request-1",
  authEpoch: 1,
  profileHash: "profile",
  permissions: {
    tenantId: "10000000-0000-4000-8000-000000000001",
    principalId: "20000000-0000-4000-8000-000000000001",
    planeKey: "neon",
    profileHash: "profile",
    allowed: new Set(["knowledge.read"]),
    denied: new Set<string>(), planLocked: new Set<string>(), planeExcluded: new Set<string>(),
    entries: new Map(), authorizationScopes: new Map(),
  },
} as unknown as VerifiedRequestContext;

function target(version = "revision-1") {
  const gateway = new AtlasDataGateway({
    authorize: vi.fn(async () => ({ allowed: true as const })),
    load: vi.fn(async () => ({
      value: { text: "Authoritative content" },
      source: { sourceKind: "content" as const, sourceId: "source-1", sourceVersionId: version },
    })),
    mask: vi.fn(async (_context, _request, loaded) => ({ ok: true as const, value: loaded.value })),
  });
  const index = { search: vi.fn(async () => [{ chunkId: "chunk-1", sourceId: "source-1", revisionId: "revision-1", score: 0.9 }]) };
  const catalog = {
    getSource: vi.fn(async () => ({ sourceId: "source-1", tenantId: context.tenantId, permissionCode: "knowledge.read", status: "active" as const })),
    getRevision: vi.fn(async () => ({ sourceId: "source-1", revisionId: "revision-1", checksum: "sha256:abcdef123456", status: "ready" as const })),
  };
  const materializer = { materialize: vi.fn(async () => ({ title: "Handbook", excerpt: "Authoritative content", text: "Authoritative content" })) };
  return { index, catalog, gateway, materializer, service: new AtlasRetrievalService({ index, catalog, dataGateway: gateway, materializer }) };
}

describe("AtlasRetrievalService", () => {
  it("re-authorizes and reloads canonical content before producing a citation", async () => {
    const value = target();
    const results = await value.service.retrieve(context, { query: "handbook" });
    expect(results).toHaveLength(1);
    expect(results[0]?.citation).toMatchObject({ sourceId: "source-1", revisionId: "revision-1", chunkId: "chunk-1" });
    expect(value.index.search).toHaveBeenCalledWith(expect.objectContaining({ tenantId: context.tenantId }));
  });

  it("omits stale index candidates when the canonical revision changes", async () => {
    const value = target("revision-2");
    await expect(value.service.retrieve(context, { query: "handbook" })).resolves.toEqual([]);
    expect(value.materializer.materialize).not.toHaveBeenCalled();
  });

  it("emits bounded operational metrics without recording content", async () => {
    const metrics: string[] = [];
    const value = target();
    const service = new AtlasRetrievalService({
      index: value.index,
      catalog: value.catalog,
      dataGateway: value.gateway,
      materializer: value.materializer,
      observe: (metric) => metrics.push(metric),
    });
    await service.retrieve(context, { query: "handbook" });
    expect(metrics).toContain("candidate_seen");
    expect(metrics).toContain("passage_emitted");
    expect(metrics.join(" ")).not.toContain("handbook");
  });

  it("omits candidates that the current verified permission context cannot read", async () => {
    const value = target();
    (context.permissions.allowed as Set<string>).clear();
    await expect(value.service.retrieve(context, { query: "handbook" })).resolves.toEqual([]);
    (context.permissions.allowed as Set<string>).add("knowledge.read");
  });
});
