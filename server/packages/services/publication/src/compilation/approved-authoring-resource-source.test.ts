import { expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("kysely", () => ({ sql: () => ({ execute: query }) }));
import { createApprovedAuthoringResourcePublication } from "./approved-authoring-resource-source.js";
const source = {
  releaseId: "release",
  releaseNo: 1,
  publicationKey: "fixture.resource",
  generatedAt: "2026-10-08T00:00:00Z",
  kind: "entity_authoring_descriptor" as const,
  payload: {
    schema: "entity.installed-authoring-descriptor/1",
    schemaVersion: 1,
    descriptor: {},
    descriptorHash: "a".repeat(64),
  },
};
const canonical = {
  canonicalBytes: (v: unknown) => Buffer.from(JSON.stringify(v)),
  sha256: (v: Uint8Array) => createHash("sha256").update(v).digest("hex"),
};
function setup() {
  const authorizeReview = vi.fn(async () => {}),
    qualifyResource = vi.fn(async () => {}),
    readSnapshot = vi.fn(async () => structuredClone(source));
  return {
    authorizeReview,
    qualifyResource,
    readSnapshot,
    adapter: createApprovedAuthoringResourcePublication({
      database: {
        transaction: () => ({
          execute: (fn: (tx: unknown) => unknown) => fn({}),
        }),
      } as unknown as Kysely<Record<string, never>>,
      authorityTenantId: "authority",
      maximumBytes: 10000,
      canonical,
      readSnapshot,
      authorizeReview,
      qualifyResource,
    }),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({
    rows: [{ author_id: "author", reviewer_id: "reviewer" }],
  });
});
it("rechecks exact approved source and current review on every phase", async () => {
  const f = setup();
  expect(await f.adapter.load("release")).toEqual(source);
  await f.adapter.qualify(source, "dispatch");
  expect(f.authorizeReview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: "dispatch",
      authorId: "author",
      reviewerId: "reviewer",
    }),
  );
  f.authorizeReview.mockRejectedValueOnce(Error("REVOKED"));
  await expect(f.adapter.qualify(source, "sign")).rejects.toThrow("REVOKED");
});
it("rejects absent approval and changed resource source", async () => {
  const f = setup();
  query.mockResolvedValueOnce({ rows: [] }); // transaction scope
  query.mockResolvedValueOnce({ rows: [] }); // no approved ledger row
  await expect(f.adapter.load("release")).rejects.toThrow(
    "APPROVED_SOURCE_REQUIRED",
  );
  await expect(
    f.adapter.qualify({ ...source, publicationKey: "changed" }, "sign"),
  ).rejects.toThrow("SOURCE_CHANGED");
  f.readSnapshot.mockResolvedValueOnce({ ...source, releaseId: "other" });
  await expect(f.adapter.load("release")).rejects.toThrow("SOURCE_INVALID");
});
