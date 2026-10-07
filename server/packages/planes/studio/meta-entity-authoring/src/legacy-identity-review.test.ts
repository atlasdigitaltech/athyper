import { expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
import {
  createLegacyIdentityReviewResolver,
  type LegacyIdentityReviewReceipt,
} from "./legacy-identity-review.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = {
  contractSchema: "athyper.meta-entity-contract/2.2",
  fields: [],
} as unknown as MetaEntityGraph;
const input = {
  entityId: id(1),
  changeSetId: id(2),
  actorId: id(3),
  tenantId: null,
  expectedRevision: 2,
  expectedSourceHash: sha256(source),
  idempotencyKey: "identity-install-1",
};
const receipt: LegacyIdentityReviewReceipt = {
  schema: "entity.legacy-identity-review/1",
  reference: "review/fixture",
  entityId: input.entityId,
  changeSetId: input.changeSetId,
  tenantId: null,
  sourceHash: input.expectedSourceHash,
  authoringSchemaHash: "a".repeat(64),
  reviewedPlanHash: "b".repeat(64),
  proposerId: id(3),
  reviewerId: id(4),
  releases: [],
};
const tx = {} as Transaction<Record<string, never>>;
function fixture(value: unknown = receipt) {
  const load = vi.fn(async () => ({
    receipt: structuredClone(value) as LegacyIdentityReviewReceipt,
    hash: sha256(value),
  }));
  const authorize = vi.fn(
    async (
      _tx: Transaction<Record<string, never>>,
      _receipt: LegacyIdentityReviewReceipt,
      _hash: string,
    ) => {},
  );
  const resolve = createLegacyIdentityReviewResolver({
    store: { load, authorize },
    maximumBytes: 4096,
    authoringSchemaHash: receipt.authoringSchemaHash,
  });
  return { resolve, load, authorize };
}
it("resolves an exact named identity decision and rechecks current authority on replay", async () => {
  const f = fixture();
  expect(await f.resolve(tx, input, source)).toMatchObject({
    reviewerId: receipt.reviewerId,
    reviewHash: sha256(receipt),
    reviewedPlanHash: receipt.reviewedPlanHash,
  });
  f.authorize.mockRejectedValueOnce(new Error("REVOKED"));
  await expect(f.resolve(tx, input, source)).rejects.toThrow("REVOKED");
  expect(f.load).toHaveBeenCalledTimes(2);
});
it("rejects publication receipts, self-review, cross-scope and stale sources before authority resolution", async () => {
  for (const patch of [
    { schema: "entity.product-review/1" },
    { reviewerId: input.actorId },
    { proposerId: receipt.reviewerId },
    { tenantId: id(5) },
    { entityId: id(5) },
    { changeSetId: id(5) },
    { sourceHash: "c".repeat(64) },
    { authoringSchemaHash: "c".repeat(64) },
    { reviewReference: "injected" },
    { reviewerId: "Platform Owner" },
  ]) {
    const f = fixture({ ...receipt, ...patch });
    await expect(f.resolve(tx, input, source)).rejects.toThrow();
    expect(f.authorize).not.toHaveBeenCalled();
  }
});
it("does not treat a valid hash as human authority and rejects changed or missing evidence", async () => {
  const f = fixture();
  f.authorize.mockRejectedValue(new Error("NO_AUTHENTICATED_REVIEW"));
  await expect(f.resolve(tx, input, source)).rejects.toThrow(
    "NO_AUTHENTICATED_REVIEW",
  );
  f.load.mockResolvedValueOnce({ receipt, hash: "c".repeat(64) });
  await expect(f.resolve(tx, input, source)).rejects.toThrow(
    "independently attributed",
  );
  const absent = createLegacyIdentityReviewResolver({
    store: { load: async () => null, authorize: f.authorize },
    maximumBytes: 4096,
    authoringSchemaHash: receipt.authoringSchemaHash,
  });
  await expect(absent(tx, input, source)).rejects.toThrow();
});
it("freezes evidence across asynchronous authorization and enforces receipt size", async () => {
  const f = fixture();
  f.authorize.mockImplementationOnce(async (_tx, value) => {
    Reflect.set(value, "reviewerId", id(7));
  });
  expect((await f.resolve(tx, input, source)).reviewerId).toBe(
    receipt.reviewerId,
  );
  const small = createLegacyIdentityReviewResolver({
    store: { load: f.load, authorize: f.authorize },
    maximumBytes: 5,
    authoringSchemaHash: receipt.authoringSchemaHash,
  });
  await expect(small(tx, input, source)).rejects.toThrow();
});
