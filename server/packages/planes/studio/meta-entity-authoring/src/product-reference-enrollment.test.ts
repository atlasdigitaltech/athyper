import { expect, it, vi, beforeEach } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ProductReferenceEnrollmentOptions } from "./product-reference-enrollment.js";
const { transport, ownership, identities, database, query } = vi.hoisted(
  () => ({
    transport: vi.fn(),
    ownership: vi.fn(),
    identities: vi.fn(),
    database: { isTransaction: true },
    query: vi.fn(),
  }),
);
vi.mock("./product-command-authority.js", () => ({
  withProductCommandAuthority: transport,
}));
vi.mock("./kysely-authoring-repository.js", () => ({
  KyselyMetaEntityAuthoringRepository: class {
    executeLegacyOwnershipInitialization = ownership;
    executeLegacyIdentityInstallation = identities;
  },
}));
vi.mock("kysely", () => ({ sql: () => ({ execute: query }) }));
import { createProductReferenceEnrollment } from "./product-reference-enrollment.js";
const context = {
  principalId: "actor",
  tenantId: "platform",
} as VerifiedRequestContext;
const command = {
  changeSetId: "draft",
  entityId: "entity",
  expectedRevision: 2,
  expectedSourceHash: "a".repeat(64),
  idempotencyKey: "enrollment-00001",
};
beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [{ id: "draft" }] });
  transport.mockImplementation(async (options) =>
    options.execute(database, structuredClone(options.command)),
  );
  ownership.mockResolvedValue({ revision: 3 });
  identities.mockResolvedValue({ revision: 4 });
});
function fixture() {
  const resolvePolicies = vi.fn(async (..._args: unknown[]) => ({
    ownership: { authoringSchemaHash: "a".repeat(64) },
    identities: { authoringSchemaHash: "a".repeat(64) },
  }));
  const service = createProductReferenceEnrollment({
    database,
    authority: {},
    resolvePolicies,
  } as unknown as ProductReferenceEnrollmentOptions);
  return { service, resolvePolicies };
}
it("uses current authenticated actor and distinct admission content for both canonical writers", async () => {
  const f = fixture();
  await f.service.initializeOwnership(context, command);
  await f.service.installIdentities(context, command);
  expect(transport.mock.calls.map(([o]) => o.command.kind)).toEqual([
    "ownership",
    "identities",
  ]);
  expect(transport.mock.calls[0]![0].scope).toEqual({
    authorityTenantId: "platform",
    actorId: "actor",
    changeSetId: "draft",
  });
  for (const fn of [ownership, identities])
    expect(fn).toHaveBeenCalledWith({
      ...command,
      actorId: "actor",
      tenantId: null,
    });
  expect(f.resolvePolicies).toHaveBeenCalledTimes(2);
});
it("rejects direct authority injection before issuing admission", async () => {
  const f = fixture();
  for (const extra of [
    { actorId: "other" },
    { tenantId: "other" },
    { reviewerId: "other" },
  ])
    await expect(
      f.service.installIdentities(context, { ...command, ...extra }),
    ).rejects.toMatchObject({ code: "PRODUCT_REFERENCE_INPUT_INVALID" });
  expect(transport).not.toHaveBeenCalled();
});
it("does not resolve resources or write without exact database admission", async () => {
  query.mockResolvedValue({ rows: [] });
  const f = fixture();
  await expect(
    f.service.initializeOwnership(context, command),
  ).rejects.toMatchObject({ code: "PRODUCT_REFERENCE_ADMISSION_REQUIRED" });
  expect(f.resolvePolicies).not.toHaveBeenCalled();
  expect(ownership).not.toHaveBeenCalled();
});
it("rejects mismatched installed descriptors before either writer", async () => {
  const f = fixture();
  f.resolvePolicies.mockResolvedValue({
    ownership: { authoringSchemaHash: "a".repeat(64) },
    identities: { authoringSchemaHash: "b".repeat(64) },
  });
  await expect(
    f.service.installIdentities(context, command),
  ).rejects.toMatchObject({ code: "PRODUCT_REFERENCE_RESOURCE_MISMATCH" });
  expect(identities).not.toHaveBeenCalled();
});
it("snapshots request context before asynchronous governance", async () => {
  const f = fixture(),
    mutable = { ...context };
  transport.mockImplementationOnce(async (options) => {
    mutable.principalId = "changed";
    return options.execute(database, structuredClone(options.command));
  });
  await f.service.initializeOwnership(mutable, command);
  expect(f.resolvePolicies.mock.calls[0]?.[1]).toMatchObject({
    principalId: "actor",
  });
});
