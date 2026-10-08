import { expect, it, vi, beforeEach } from "vitest";
import type { Kysely } from "kysely";
const mocks = vi.hoisted(() => ({ query: vi.fn(), resolve: vi.fn() }));
vi.mock("kysely", () => ({ sql: () => ({ execute: mocks.query }) }));
vi.mock("@athyper/server-platform-iam", () => ({
  createKyselyPermissionResolver: () => ({ resolve: mocks.resolve }),
}));
import { createCurrentResourceReviewEligibility } from "./resource-review-eligibility.js";
const authority = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  realmKey: "platform-control",
  issuer: "https://iam.dev.athyper.test/realms/platform-control",
  audience: "athyper-platform-control-api",
};
const database = {
  transaction: () => ({
    setIsolationLevel: () => ({
      execute: (work: (tx: unknown) => unknown) => work({}),
    }),
  }),
} as unknown as Kysely<Record<string, never>>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue({
    rows: [{ auth_epoch: 1, author_id: "author", reviewer_id: "reviewer" }],
  });
  mocks.resolve.mockImplementation(async (id) => ({
    ...id,
    entries: [
      { code: "studio.metadata.contract.edit", status: "allow" },
      { code: "studio.metadata.contract.review", status: "allow" },
    ],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    authorizationScopes: [
      {
        permissionCode: "studio.metadata.contract.edit",
        tenantWide: true,
        visibility: "all",
      },
      {
        permissionCode: "studio.metadata.contract.review",
        tenantWide: true,
        visibility: "all",
      },
    ],
  }));
});
it("rechecks both named humans through current IAM without fabricating session assurance", async () => {
  await createCurrentResourceReviewEligibility({ database, authority })({
    releaseId: "release",
    authorId: "author",
    reviewerId: "reviewer",
  });
  expect(mocks.resolve).toHaveBeenCalledTimes(2);
  expect(mocks.resolve.mock.calls[0]![0]).not.toHaveProperty("assurance");
});
it("rejects self review and current explicit deny", async () => {
  const check = createCurrentResourceReviewEligibility({ database, authority });
  await expect(
    check({ releaseId: "release", authorId: "same", reviewerId: "same" }),
  ).rejects.toThrow("ELIGIBILITY_DENIED");
  mocks.resolve.mockResolvedValueOnce({
    tenantId: authority.tenantId,
    principalId: "author",
    planeKey: "studio",
    entries: [],
    denied: ["studio.metadata.contract.edit"],
  });
  await expect(
    check({ releaseId: "release", authorId: "author", reviewerId: "reviewer" }),
  ).rejects.toThrow("ELIGIBILITY_DENIED");
});

it("rejects a ledger approval without authenticated audit provenance", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  await expect(
    createCurrentResourceReviewEligibility({ database, authority })({
      releaseId: "release",
      authorId: "author",
      reviewerId: "reviewer",
    }),
  ).rejects.toThrow("PROVENANCE_REQUIRED");
});
