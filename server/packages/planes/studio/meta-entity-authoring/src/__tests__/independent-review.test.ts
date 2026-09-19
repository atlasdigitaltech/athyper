import { expect, it, vi } from "vitest";
import {
  MetaEntityAuthoringService,
  type AuthoringServiceOptions,
} from "../authoring-service.js";
it("rejects the author and submitter and forwards the exact revision for an independent reviewer", async () => {
  const transition = vi.fn(async () => ({ status: "approved" }));
  const service = new MetaEntityAuthoringService({
    repository: {
      get: async () => ({
        id: "draft",
        status: "in_review",
        revision: 8,
        createdBy: "author",
        submittedBy: "submitter",
      }),
      transition,
    },
  } as unknown as AuthoringServiceOptions);
  for (const actorId of ["author", "submitter"])
    await expect(
      service.approve({ changeSetId: "draft", expectedRevision: 8, actorId }),
    ).rejects.toThrow("Authors and submitters");
  expect(transition).not.toHaveBeenCalled();
  await service.approve({
    changeSetId: "draft",
    expectedRevision: 8,
    actorId: "reviewer",
  });
  expect(transition).toHaveBeenCalledWith({
    changeSetId: "draft",
    expectedRevision: 8,
    actorId: "reviewer",
    from: "in_review",
    to: "approved",
  });
});
it("propagates a concurrent revision conflict without treating approval as successful", async () => {
  const service = new MetaEntityAuthoringService({
    repository: {
      get: async () => ({ createdBy: "author", submittedBy: "author" }),
      transition: async () => {
        throw Error("Revision changed");
      },
    },
  } as unknown as AuthoringServiceOptions);
  await expect(
    service.approve({
      changeSetId: "draft",
      expectedRevision: 7,
      actorId: "reviewer",
    }),
  ).rejects.toThrow("Revision changed");
});
