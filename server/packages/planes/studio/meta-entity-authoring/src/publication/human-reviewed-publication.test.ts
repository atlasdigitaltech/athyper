import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { MetaEntityChangeSet } from "@athyper/server-contract-meta-entity-authoring";
import { compileTableEntityProduct, parseTableEntityProduct } from "../authoring/table-product.js";
import { compileGraph, sha256 } from "../deterministic.js";
import type { ProductReviewReceipt } from "../product-review.js";
import { publishHumanReviewedProducts, type HumanReviewedPublicationPlan, type HumanReviewedPublicationPorts } from "./human-reviewed-publication.js";

function fixture() {
  const product = parseTableEntityProduct(JSON.parse(readFileSync(new URL(
    "../../../../../../../metadata/entities/address/definition.json", import.meta.url), "utf8")));
  const { graph } = compileTableEntityProduct(product, "neon");
  graph.surfaces!.find(s => s.surfaceKind === "list")!.layoutConfig!.tableEntityProduct = {
    schema: "athyper.table-entity-source/1", productHash: sha256(product), targetPlanes: ["neon"], moduleCode: product.moduleCode,
  };
  const artifact = compileGraph(graph), changeSetId = randomUUID(), entityId = randomUUID();
  const authorId = randomUUID(), reviewerId = randomUUID();
  const plan: HumanReviewedPublicationPlan = {
    schema: "athyper.human-reviewed-publication-plan/1", publisherId: randomUUID(), members: [{
      changeSetId, entityId, revision: 3, contractHash: artifact.contractHash, descriptorHash: artifact.descriptorHash,
      sourceReleaseId: null, authorId, reviewerId,
      targets: [{ plane: "neon", contractHash: artifact.contractHash, descriptorHash: artifact.descriptorHash }],
    }],
  };
  const changeSet = { id: changeSetId, entityId, entityCode: "address", tenantId: null, status: "approved",
    revision: 3, createdBy: randomUUID(), submittedBy: authorId, approvedBy: reviewerId } as MetaEntityChangeSet;
  const receipts: ProductReviewReceipt[] = (["adopt", "submit", "approve"] as const).map((action, index) => ({
    action, actorId: action === "approve" ? reviewerId : authorId, changeSetId, requestId: randomUUID(),
    expectedRevision: action === "approve" ? 2 : 1, expectedContractHash: artifact.contractHash,
    revision: index + 1, status: ["draft", "in_review", "approved"][index]!,
  }));
  const publish = vi.fn(async () => ({ release: { id: randomUUID() } })) as unknown as HumanReviewedPublicationPorts["service"]["publish"];
  const ports: HumanReviewedPublicationPorts = {
    authorize: vi.fn(async () => {}), locked: vi.fn(async (_ids, work) => work()),
    service: { readGraph: vi.fn(async () => structuredClone({ changeSet, graph })), publish },
    reviews: vi.fn(async () => ({ receipts: structuredClone(receipts), sourceReleaseId: null })),
    qualify: vi.fn(async () => {}), record: vi.fn(async () => {}),
  };
  return { plan, ports, graph, changeSet, receipts };
}

it("publishes as a workload while retaining independent human authorship and review", async () => {
  const f = fixture(), before = structuredClone(f.changeSet);
  const result = await publishHumanReviewedProducts(f.plan, f.ports);
  expect(result.status).toBe("dispatched");
  expect(f.ports.service.publish).toHaveBeenCalledWith({ changeSetId: before.id, expectedRevision: 3,
    expectedContractHash: f.plan.members[0]!.contractHash, expectedSourceReleaseId: null,
    actorId: f.plan.publisherId, targetPlanes: ["neon"] });
  expect(f.changeSet).toEqual(before);
  expect(f.ports.qualify).toHaveBeenCalledOnce();
});

it.each(["adopt", "submit", "approve"])("requires persisted %s evidence before qualification or signing", async action => {
  const f = fixture(); f.receipts.splice(f.receipts.findIndex(r => r.action === action), 1);
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("HUMAN_RECEIPTS_REQUIRED");
  expect(f.ports.qualify).not.toHaveBeenCalled(); expect(f.ports.service.publish).not.toHaveBeenCalled();
});

it("rejects reviewer adoption of the reviewed revision", async () => {
  const f = fixture(); f.receipts.push({ ...f.receipts[0]!, requestId: randomUUID(), actorId: f.changeSet.approvedBy! });
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("HUMAN_RECEIPTS_REQUIRED");
});

it("does not accept a human reviewer as the publishing workload", async () => {
  const f = fixture();
  await expect(publishHumanReviewedProducts({ ...f.plan, publisherId: f.changeSet.approvedBy! }, f.ports)).rejects.toThrow("ACTOR_SEPARATION_REQUIRED");
  expect(f.ports.authorize).not.toHaveBeenCalled();
});

it("requires enrolled authority before reading any sources", async () => {
  const f = fixture(); vi.mocked(f.ports.authorize).mockRejectedValue(Error("policy not enrolled"));
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("policy not enrolled");
  expect(f.ports.service.readGraph).not.toHaveBeenCalled();
});

it("rechecks authority after target qualification", async () => {
  const f = fixture(); vi.mocked(f.ports.authorize).mockResolvedValueOnce(undefined).mockRejectedValue(Error("revoked"));
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("revoked");
  expect(f.ports.service.publish).not.toHaveBeenCalled();
});

it("rejects source changes during qualification before signing", async () => {
  const f = fixture(); vi.mocked(f.ports.qualify).mockImplementation(async () => { f.changeSet.revision++; });
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("REVIEW_CHANGED");
  expect(f.ports.service.publish).not.toHaveBeenCalled();
});

it("does not publish when any target qualification fails", async () => {
  const f = fixture(); vi.mocked(f.ports.qualify).mockRejectedValue(Error("missing dependency"));
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("missing dependency");
  expect(f.ports.service.publish).not.toHaveBeenCalled();
});

it("rejects rebinding source predecessor, targets and receipt hashes", async () => {
  for (const change of ["predecessor", "targets", "receipt"] as const) {
    const f = fixture();
    if (change === "predecessor") vi.mocked(f.ports.reviews).mockResolvedValue({ receipts: f.receipts, sourceReleaseId: randomUUID() });
    if (change === "targets") (f.plan.members[0]!.targets[0] as { descriptorHash: string }).descriptorHash = "0".repeat(64);
    if (change === "receipt") f.receipts[2]!.expectedContractHash = "0".repeat(64);
    await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("HUMAN_PUBLICATION_");
    expect(f.ports.service.publish).not.toHaveBeenCalled();
  }
});

it("requires every source to pass before dispatching any member", async () => {
  const f = fixture(), other = fixture();
  const plan = { ...f.plan, members: [...f.plan.members, ...other.plan.members] };
  vi.mocked(f.ports.service.readGraph).mockImplementation(async id => structuredClone(
    id === f.changeSet.id ? { changeSet: f.changeSet, graph: f.graph } : { changeSet: other.changeSet, graph: other.graph }));
  await expect(publishHumanReviewedProducts(plan, f.ports)).rejects.toThrow("HUMAN_RECEIPTS_REQUIRED");
  expect(f.ports.service.publish).not.toHaveBeenCalled();
});

it("recovers an exact committed release by redispatching without signing again", async () => {
  const f = fixture(), release = { id: randomUUID(), releaseNo: 1 };
  Object.assign(f.changeSet, { status: "published", revision: 4 });
  f.ports.completed = vi.fn(async () => release);
  f.ports.redispatch = vi.fn(async () => {});
  await publishHumanReviewedProducts(f.plan, f.ports);
  expect(f.ports.qualify).toHaveBeenCalledOnce();
  expect(f.ports.redispatch).toHaveBeenCalledWith(f.plan.members[0], release);
  expect(f.ports.service.publish).not.toHaveBeenCalled();
});
it("rechecks original human review and current authority before redispatch", async () => {
  const f = fixture();
  Object.assign(f.changeSet, { status: "published", revision: 4 });
  f.ports.completed = vi.fn(async () => ({ id: randomUUID(), releaseNo: 1 }));
  f.ports.redispatch = vi.fn(async () => {});
  f.receipts.pop();
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("HUMAN_RECEIPTS_REQUIRED");
  expect(f.ports.redispatch).not.toHaveBeenCalled();
});
it("rejects an unpinned published source or unavailable recovery dispatcher", async () => {
  const f = fixture(); Object.assign(f.changeSet, { status: "published", revision: 4 });
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("REVIEW_CHANGED");
  f.ports.completed = vi.fn(async () => ({ id: randomUUID(), releaseNo: 1 }));
  await expect(publishHumanReviewedProducts(f.plan, f.ports)).rejects.toThrow("HUMAN_PUBLICATION_");
  expect(f.ports.service.publish).not.toHaveBeenCalled();
});
