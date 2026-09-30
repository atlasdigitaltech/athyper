import { expect, it, vi } from "vitest";
import { AtlasKnowledgeService } from "../knowledge.js";
import { AtlasBoundedCache } from "../bounded-cache.js";
import { context as base } from "./review-fixture.js";
import type {
  AtlasKnowledgeCitation,
  AtlasKnowledgeSource,
} from "@athyper/server-contract-ai";
const context = {
  ...base,
  permissions: { ...base.permissions, allowed: ["documents.read"] },
};
const citation: AtlasKnowledgeCitation = {
  sourceId: "doc",
  sourceVersionId: "v1",
  revisionId: "10000000-0000-4000-8000-000000000010",
  chunkId: "10000000-0000-4000-8000-000000000011",
  contentHash: "a".repeat(64),
  characterStart: 0,
  characterEnd: 20,
};
const source: AtlasKnowledgeSource = {
  id: "source",
  sourceId: "doc",
  sourceKind: "document",
  tenantId: context.tenantId,
  permissionCode: "documents.read",
  status: "active",
  createdAt: "2026-09-10T00:00:00Z",
};
function harness() {
  const search = vi.fn(async () => [
    { citation, score: 1, permissionCode: "fake.index.permission" },
  ]);
  const admitCandidates = vi.fn(async () => [{ citation, source }]);
  const authorize = vi.fn(async () => true);
  const service = new AtlasKnowledgeService({
    index: { search } as never,
    repository: { admitCandidates } as never,
    admission: { authorize },
  });
  return {
    service,
    search,
    admitCandidates,
    authorize,
    run: () => service.search({ context, query: "document" }),
  };
}
it("reuses candidates but repeats canonical and owner admission on every hit", async () => {
  const h = harness();
  expect(await h.run()).toEqual([{ citation, score: 1 }]);
  expect(await h.run()).toEqual([{ citation, score: 1 }]);
  expect(h.search).toHaveBeenCalledTimes(1);
  expect(h.admitCandidates).toHaveBeenCalledTimes(2);
  expect(h.authorize).toHaveBeenCalledTimes(2);
  h.authorize.mockResolvedValue(false);
  expect(await h.run()).toEqual([]);
  h.authorize.mockRejectedValue(new Error("owner offline"));
  expect(await h.run()).toEqual([]);
});
it("excludes deleted, superseded and mismatched canonical evidence despite cached hits", async () => {
  const h = harness();
  await h.run();
  h.admitCandidates.mockResolvedValue([]);
  expect(await h.run()).toEqual([]);
  h.admitCandidates.mockResolvedValue([
    { citation: { ...citation, contentHash: "b".repeat(64) }, source },
  ]);
  expect(await h.run()).toEqual([]);
  h.admitCandidates.mockResolvedValue([
    { citation, source: { ...source, tenantId: "other" } },
  ]);
  expect(await h.run()).toEqual([]);
  expect(h.authorize).toHaveBeenCalledTimes(1);
});
it("requires an owner adapter and respects live permission denial with unchanged epochs", async () => {
  const h = harness();
  await h.run();
  expect(
    await h.service.search({
      context: {
        ...context,
        permissions: { ...context.permissions, denied: ["documents.read"] },
      },
      query: "document",
    }),
  ).toEqual([]);
  expect(h.authorize).toHaveBeenCalledTimes(1);
  expect(
    await new AtlasKnowledgeService({
      repository: {} as never,
      index: {} as never,
    }).search({ context, query: "doc" }),
  ).toEqual([]);
});
it("separates principal, epoch, profile and plane candidate caches", async () => {
  const h = harness();
  await h.run();
  for (const patch of [
    { authEpoch: 2 },
    {
      profileHash: "new",
      permissions: { ...context.permissions, profileHash: "new" },
    },
    {
      principalId: "other",
      permissions: { ...context.permissions, principalId: "other" },
    },
  ])
    await h.service.search({
      context: { ...context, ...patch },
      query: "document",
    });
  expect(h.search).toHaveBeenCalledTimes(4);
});
it("expires and evicts bounded entries, rejects oversized values and prevents reference mutation", () => {
  let now = 0;
  const cache = new AtlasBoundedCache<{ value: string }>({
    maxEntries: 2,
    maxBytes: 100,
    ttlMs: 5,
    now: () => now,
  });
  cache.set("a", { value: "one" });
  cache.set("b", { value: "two" });
  cache.get("a")!.value = "mutated";
  expect(cache.get("a")).toEqual({ value: "one" });
  cache.set("c", { value: "three" });
  expect(cache.get("b")).toBeUndefined();
  cache.set("huge", { value: "x".repeat(200) });
  expect(cache.stats().bytes).toBeLessThanOrEqual(100);
  now = 5;
  expect(cache.get("a")).toBeUndefined();
  cache.clear();
  expect(cache.stats().entries).toBe(0);
});

it("refreshes expired candidates and bounds duplicate or malformed index output", async () => {
  vi.useFakeTimers();
  try {
    const h = harness();
    h.search.mockResolvedValue(Array.from({ length: 100 }, () => ({ citation, score: 1, permissionCode: "untrusted" })));
    expect(await h.run()).toEqual([{ citation, score: 1 }]);
    expect(h.admitCandidates.mock.calls[0]).toBeDefined();
    vi.advanceTimersByTime(5_000);
    expect(await h.run()).toEqual([{ citation, score: 1 }]);
    expect(h.search).toHaveBeenCalledTimes(2);
    h.search.mockResolvedValue([{ citation: { ...citation, chunkId: "invalid" }, score: 1, permissionCode: "untrusted" }]);
    vi.advanceTimersByTime(5_000);
    expect(await h.run()).toEqual([]);
  } finally { vi.useRealTimers(); }
});
