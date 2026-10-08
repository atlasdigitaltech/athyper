import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { PublicationAuthorityRepository } from "@athyper/server-contract-publication";
import { createAuthoringResourceReview } from "./authoring-resource-review.js";
const source = {
  releaseId: "00000000-0000-4000-8000-000000000001",
  publicationKey: "fixture.descriptor",
  releaseNo: 1,
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
function fixture() {
  const sourceHash = canonical.sha256(canonical.canonicalBytes(source)),
    createRelease = vi.fn(async (input) => input),
    transitionRelease = vi.fn(async (input) => input),
    audit = vi.fn(async () => {}),
    authorize = vi.fn(async () => ({
      actorId: "reviewer",
      tenantId: "authority",
    })),
    qualify = vi.fn(async () => {});
  const service = createAuthoringResourceReview({
    canonical,
    run: async (_context, work) =>
      work({
        repository: {
          createRelease,
          transitionRelease,
        } as unknown as PublicationAuthorityRepository,
        source: async () => source,
        inspect: async () => ({
          authorId: "author",
          reviewerId: null,
          sourceHash,
          status: "preparing",
        }),
        authorize,
        qualify,
        audit,
      }),
  });
  return {
    service,
    sourceHash,
    createRelease,
    transitionRelease,
    audit,
    authorize,
    qualify,
  };
}
it("proposes exact generated source and independently approves through the existing repository", async () => {
  const f = fixture();
  await f.service.execute(
    {},
    {
      action: "propose",
      releaseId: source.releaseId,
      expectedSourceHash: f.sourceHash,
    },
  );
  expect(f.createRelease).toHaveBeenCalledWith(
    expect.objectContaining({
      authoringResourceSource: source,
      releaseHash: f.sourceHash,
    }),
  );
  await f.service.execute(
    {},
    {
      action: "approve",
      releaseId: source.releaseId,
      expectedSourceHash: f.sourceHash,
    },
  );
  expect(f.transitionRelease).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: "reviewer", status: "approved" }),
  );
  expect(f.audit).toHaveBeenCalledTimes(2);
});
it("blocks source drift, self-review and failed current qualification", async () => {
  const f = fixture(),
    command = {
      action: "approve" as const,
      releaseId: source.releaseId,
      expectedSourceHash: f.sourceHash,
    };
  await expect(
    f.service.execute({}, { ...command, expectedSourceHash: "0".repeat(64) }),
  ).rejects.toThrow("SOURCE_CHANGED");
  f.authorize.mockResolvedValueOnce({
    actorId: "author",
    tenantId: "authority",
  });
  await expect(f.service.execute({}, command)).rejects.toThrow(
    "INDEPENDENT_REVIEW_REQUIRED",
  );
  f.qualify.mockRejectedValueOnce(Error("REVOKED"));
  await expect(f.service.execute({}, command)).rejects.toThrow("REVOKED");
  expect(f.transitionRelease).not.toHaveBeenCalled();
});
