import { expect, it, vi } from "vitest";
import type { AuthoringServiceOptions } from "../authoring-service.js";
import { MetaEntityAuthoringService } from "../authoring-service.js";

function fixture() {
  const saved = {
    id: "change",
    tenantId: "tenant",
    entityId: "entity",
    entityCode: "invoice",
    branchCode: "main",
    revision: 2,
    status: "draft",
    createdBy: "author",
  };
  const persisted = {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "invoice" },
    fields: [],
    operations: [],
  };
  const repository = {
    replaceGraph: vi.fn(async () => saved),
    loadGraph: vi.fn(async () => persisted),
    get: vi.fn(async () => saved),
    createRelease: vi.fn(),
  };
  const preview = {
    saved: vi.fn(async () => ({
      developmentEvidence: true,
      state: "active",
      savedRevision: 2,
    })),
  };
  const service = new MetaEntityAuthoringService({
    repository,
    preview,
  } as unknown as AuthoringServiceOptions);
  const request = {
    changeSetId: "change",
    actorId: "author",
    expectedRevision: 1,
    graph: { ...persisted, fields: [{ fieldKey: "submitted" }] },
  } as Parameters<MetaEntityAuthoringService["replaceGraph"]>[0];
  return { saved, persisted, repository, preview, service, request };
}
it("previews the persisted graph and exact save revision without creating a release", async () => {
  const f = fixture();
  expect(await f.service.replaceGraph(f.request)).toMatchObject({
    revision: 2,
    preview: { state: "active" },
  });
  expect(f.preview.saved).toHaveBeenCalledWith({
    changeSet: f.saved,
    graph: f.persisted,
    actorId: "author",
  });
  expect(f.repository.createRelease).not.toHaveBeenCalled();
});
it("does not claim a failed preview means the authoring save failed", async () => {
  const f = fixture();
  f.preview.saved.mockRejectedValue(Error("CONSUMER_UNAVAILABLE"));
  expect(await f.service.replaceGraph(f.request)).toMatchObject({
    revision: 2,
    preview: { state: "failed", error: "CONSUMER_UNAVAILABLE" },
  });
  expect(f.repository.replaceGraph).toHaveBeenCalledOnce();
});
it("skips preview when the stored graph has already advanced", async () => {
  const f = fixture();
  f.repository.get.mockResolvedValue({ ...f.saved, revision: 3 });
  expect(await f.service.replaceGraph(f.request)).toMatchObject({
    preview: { state: "superseded", savedRevision: 2 },
  });
  expect(f.preview.saved).not.toHaveBeenCalled();
});
it("preserves native optimistic-lock failure without starting preview", async () => {
  const f = fixture();
  f.repository.replaceGraph.mockRejectedValue(Error("REVISION_CONFLICT"));
  await expect(f.service.replaceGraph(f.request)).rejects.toThrow(
    "REVISION_CONFLICT",
  );
  expect(f.preview.saved).not.toHaveBeenCalled();
});
