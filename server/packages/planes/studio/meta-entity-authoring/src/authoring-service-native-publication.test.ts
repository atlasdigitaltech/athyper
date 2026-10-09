import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type {
  MetaEntityAuthoringRepository,
  MetaEntityChangeSet,
} from "@athyper/server-contract-meta-entity-authoring";
import { MetaEntityAuthoringService } from "./authoring-service.js";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import { sha256 } from "./deterministic.js";

function fixture() {
  const f = nativeReleaseFixture();
  f.graph.entity.ownershipModel = "system";
  f.graph.entity.entityClass = "reference";
  const compiled = f.run();
  const changeSet = {
    id: f.graph.ownedLabels!.changeSetId,
    entityId: f.graph.authoringSource.entityId,
    entityCode: f.graph.entity.entityCode,
    tenantId: null,
    status: "approved",
    revision: 3,
  } as MetaEntityChangeSet;
  const repository = {
    get: vi.fn(async () => structuredClone(changeSet)),
    loadGraph: vi.fn(async () => {
      throw Error("LEGACY_READER_FORBIDDEN");
    }),
    recordValidation: vi.fn(async () => {}),
    createRelease: vi.fn(async () => ({ id: randomUUID(), releaseNo: 1 })),
  };
  const signer = {
    sign: vi.fn(async () => ({
      signatureAlgorithm: "Ed25519",
      signingKeyId: "test",
      signature: "test",
    })),
  };
  const publication = { publish: vi.fn(async () => {}) };
  const nativePublicationSource = vi.fn(async () => ({
    graph: structuredClone(f.graph),
    compiler: { ...f.c, graphHash: sha256(f.graph) },
    controls: structuredClone(f.controls),
  }));
  const service = new MetaEntityAuthoringService({
    repository: repository as unknown as MetaEntityAuthoringRepository,
    signer,
    publication: publication as never,
    nativePublicationSource,
  });
  const input = {
    changeSetId: changeSet.id,
    expectedRevision: 3,
    expectedContractHash: compiled.contractHash,
    expectedSourceReleaseId: null,
    actorId: randomUUID(),
    targetPlanes: ["studio"] as const,
  };
  return {
    ...f,
    repository,
    signer,
    publication,
    service,
    input,
    nativePublicationSource,
    changeSet,
    compiled,
  };
}
it("validates, signs and dispatches the complete native source through canonical release creation", async () => {
  const f = fixture();
  const result = await f.service.publishNative(f.input);
  expect(f.repository.loadGraph).not.toHaveBeenCalled();
  expect(f.repository.recordValidation).toHaveBeenCalledWith(
    f.input.changeSetId,
    3,
    { deterministic: true, contractHash: f.compiled.contractHash, issues: [] },
    f.input.actorId,
    f.graph,
  );
  expect(f.signer.sign).toHaveBeenCalledWith(f.compiled);
  expect(f.repository.createRelease).toHaveBeenCalledWith({
    ...f.input,
    artifact: result.artifact,
    releaseKind: "publish",
  });
  expect(f.publication.publish).toHaveBeenCalledWith({
    releaseId: result.release.id,
    artifact: result.artifact,
    targetPlanes: ["studio"],
  });
});
it.each(["revision", "hash", "target", "approval"])(
  "rejects %s drift before validation or signing",
  async (kind) => {
    const f = fixture();
    if (kind === "revision") f.input.expectedRevision++;
    if (kind === "hash") f.input.expectedContractHash = "0".repeat(64);
    if (kind === "approval") f.changeSet.status = "in_review";
    const input =
      kind === "target"
        ? { ...f.input, targetPlanes: ["mesh"] as const }
        : f.input;
    await expect(f.service.publishNative(input)).rejects.toThrow();
    expect(f.signer.sign).not.toHaveBeenCalled();
    expect(f.repository.recordValidation).not.toHaveBeenCalled();
  },
);
it("rejects a revision changed during installed source resolution", async () => {
  const f = fixture();
  f.repository.get
    .mockResolvedValueOnce({ ...f.changeSet })
    .mockResolvedValue({ ...f.changeSet, revision: 4 });
  await expect(f.service.publishNative(f.input)).rejects.toThrow(
    "changed during publication inspection",
  );
  expect(f.signer.sign).not.toHaveBeenCalled();
});
it("does not dispatch a failed canonical allocation", async () => {
  const f = fixture();
  f.repository.createRelease.mockRejectedValue(
    Error("transaction rolled back"),
  );
  await expect(f.service.publishNative(f.input)).rejects.toThrow(
    "transaction rolled back",
  );
  expect(f.publication.publish).not.toHaveBeenCalled();
});
it("does not sign when current database authority rejects validation", async () => {
  const f = fixture();
  f.repository.recordValidation.mockRejectedValue(Error("authority revoked"));
  await expect(f.service.publishNative(f.input)).rejects.toThrow(
    "authority revoked",
  );
  expect(f.signer.sign).not.toHaveBeenCalled();
});
