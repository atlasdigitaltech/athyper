import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type {
  MetaEntityAuthoringRepository,
  MetaEntityChangeSet,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
import {
  createProductReviewService,
  type ProductReviewReceipt,
} from "./product-review.js";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
function fixture() {
  const native = nativeReleaseFixture();
  const graph = native.graph;
  let cs = {
    id: graph.ownedLabels!.changeSetId,
    tenantId: null,
    entityId: graph.authoringSource.entityId,
    entityCode: graph.entity.entityCode,
    revision: 1,
    status: "draft",
    createdBy: "admin",
    submittedBy: null,
  } as unknown as MetaEntityChangeSet;
  const receipts: ProductReviewReceipt[] = [];
  const repository = {
    get: async () => ({ ...cs }),
    loadGraph: async () => graph,
    transition: vi.fn(async (input) => {
      cs = {
        ...cs,
        revision: cs.revision + 1,
        status: input.to,
        ...(input.to === "in_review"
          ? { submittedBy: input.actorId }
          : { approvedBy: input.actorId }),
      };
      return cs;
    }),
  } as unknown as MetaEntityAuthoringRepository;
  const matches = (
    action: string,
    id: string,
    revision: number,
    hash: string,
    actor: string,
  ) =>
    Promise.resolve(
      receipts.some(
        (r) =>
          r.action === action &&
          r.changeSetId === id &&
          r.expectedRevision === revision &&
          r.expectedContractHash === hash &&
          r.actorId === actor,
      ),
    );
  const record = vi.fn(async (r: ProductReviewReceipt) => {
    receipts.push(r);
  });
  const service = createProductReviewService({
    repository,
    receipt: async (id) => receipts.find((r) => r.requestId === id) ?? null,
    nativeSource: async () => ({
      graph,
      compiler: { ...native.c, graphHash: sha256(graph) },
      controls: native.controls,
    }),
    submitted: (...a) => matches("submit", ...a),
    record,
  });
  const command = () => ({
    requestId: randomUUID(),
    expectedRevision: cs.revision,
    expectedContractHash: native.run().contractHash,
  });
  return {
    service,
    command,
    graph,
    receipts,
    record,
    repository,
    get cs() {
      return cs;
    },
    set cs(x: MetaEntityChangeSet) {
      cs = x;
    },
  };
}
it("submits and independently approves a complete native source without adoption", async () => {
  const f = fixture();
  await f.service.execute(f.cs.id, "admin", "submit", f.command());
  await f.service.execute(f.cs.id, "owner", "approve", f.command());
  expect(f.cs.status).toBe("approved");
  expect(f.cs.createdBy).toBe("admin");
  expect(f.receipts.map((r) => r.action)).toEqual(["submit", "approve"]);
});
it("denies another author and self review", async () => {
  const f = fixture();
  await expect(
    f.service.execute(f.cs.id, "other", "submit", f.command()),
  ).rejects.toMatchObject({ code: "NATIVE_PRODUCT_AUTHOR_REQUIRED" });
  await f.service.execute(f.cs.id, "admin", "submit", f.command());
  await expect(
    f.service.execute(f.cs.id, "admin", "approve", f.command()),
  ).rejects.toMatchObject({ code: "REVIEWER_SEPARATION_REQUIRED" });
});
it("rejects changed hashes and stale revisions before recording a receipt", async () => {
  const f = fixture();
  await expect(
    f.service.execute(f.cs.id, "admin", "submit", {
      ...f.command(),
      expectedContractHash: "0".repeat(64),
    }),
  ).rejects.toThrow();
  await expect(
    f.service.execute(f.cs.id, "admin", "submit", {
      ...f.command(),
      expectedRevision: 0,
    }),
  ).rejects.toThrow();
  expect(f.record).not.toHaveBeenCalled();
});
it("replays an exact submission but rejects actor or action rebinding", async () => {
  const f = fixture(),
    command = f.command();
  const result = await f.service.execute(f.cs.id, "admin", "submit", command);
  expect(await f.service.execute(f.cs.id, "admin", "submit", command)).toEqual(
    result,
  );
  expect(f.record).toHaveBeenCalledTimes(1);
  await expect(
    f.service.execute(f.cs.id, "owner", "submit", command),
  ).rejects.toThrow("Idempotency");
  await expect(
    f.service.execute(f.cs.id, "admin", "approve", command),
  ).rejects.toThrow("Idempotency");
});
it("rejects tenant sources and does not infer target planes", async () => {
  const f = fixture();
  f.cs = { ...f.cs, tenantId: randomUUID() };
  await expect(f.service.inspect(f.cs.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  f.cs = { ...f.cs, tenantId: null };
  Reflect.set(
    f.graph.referenceMembers!.members.target[0]!,
    "targetPlane",
    "neon",
  );
  await expect(f.service.inspect(f.cs.id)).rejects.toThrow();
});
it("does not transition when receipt persistence fails", async () => {
  const f = fixture();
  f.record.mockRejectedValueOnce(Error("audit unavailable"));
  await expect(
    f.service.execute(f.cs.id, "admin", "submit", f.command()),
  ).rejects.toThrow("audit unavailable");
  expect(f.repository.transition).not.toHaveBeenCalled();
});
it("retires adoption instead of generating a synthetic receipt", async () => {
  const f = fixture();
  await expect(
    f.service.execute(f.cs.id, "admin", "adopt" as "submit", f.command()),
  ).rejects.toMatchObject({ code: "LEGACY_PRODUCT_ADOPTION_RETIRED" });
  expect(f.record).not.toHaveBeenCalled();
});
it("rejects approval without the exact submitted receipt", async () => {
  const f = fixture();
  await f.service.execute(f.cs.id, "admin", "submit", f.command());
  f.receipts.length = 0;
  await expect(
    f.service.execute(f.cs.id, "owner", "approve", f.command()),
  ).rejects.toMatchObject({ code: "REVIEWER_SEPARATION_REQUIRED" });
});
