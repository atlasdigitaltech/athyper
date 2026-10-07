import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), query: vi.fn() }));
vi.mock("kysely", () => ({ sql: () => ({ execute: mocks.query }) }));
vi.mock("./installed-reference-resources.js", () => ({
  createInstalledReferenceResourceReader: () => vi.fn(),
  resolveInstalledAuthoringDescriptor: mocks.resolve,
  createInstalledIdentityReviewStore: vi.fn(),
}));
import { createProductReferenceResourcePolicies } from "./product-reference-resource-policies.js";
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
const context = {
  tenantId: "authority",
  principalId: "actor",
} as VerifiedRequestContext;
const command = {
  tenantId: null,
  actorId: "actor",
  entityId: "entity",
  changeSetId: "draft",
  expectedRevision: 1,
  expectedSourceHash: "a".repeat(64),
  idempotencyKey: "request",
};
function setup() {
  return createProductReferenceResourcePolicies({
    authorityTenantId: "authority",
    descriptorPin: {
      kind: "entity_authoring_descriptor",
      publicationKey: "descriptor",
      releaseId: "release",
      unsignedHash: "b".repeat(64),
      artifactHash: "c".repeat(64),
    },
    descriptorHash: "d".repeat(64),
    maximumBytes: 10000,
    maximumReleases: 20,
    supportedLocales: ["en"],
    verifier: { verify: async () => true },
    authorizeReview: async () => {},
    audit: async () => {},
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue({
    schemaVersion: 1,
    authoringSchemaHash: "d".repeat(64),
  });
});
it("revalidates installed descriptor and rejects changed admitted scope", async () => {
  const policies = await setup()(tx, context, command);
  await policies.ownership.admit(tx, command);
  expect(mocks.resolve).toHaveBeenCalledTimes(2);
  await expect(
    policies.ownership.admit(tx, { ...command, actorId: "other" }),
  ).rejects.toThrow("Exact admitted source scope");
  mocks.resolve.mockRejectedValueOnce(Error("RESOURCE_REVOKED"));
  await expect(policies.ownership.admit(tx, command)).rejects.toThrow(
    "RESOURCE_REVOKED",
  );
});
it("rejects missing or ambiguous exact installed review rather than selecting latest", async () => {
  const policies = await setup()(tx, context, command);
  for (const rows of [[], [{}, {}]]) {
    mocks.query.mockResolvedValueOnce({ rows });
    await expect(
      policies.identities.resolveReview(tx, command, {} as never),
    ).rejects.toThrow("One exact installed identity review");
  }
});
