import { expect, it, vi, beforeEach } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ProductReferenceEnrollmentOptions } from "./product-reference-enrollment.js";
const {
  transport,
  ownership,
  identities,
  conversion,
  bootstrap,
  constructed,
  qualify,
  database,
  query,
} = vi.hoisted(() => ({
  transport: vi.fn(),
  ownership: vi.fn(),
  identities: vi.fn(),
  conversion: vi.fn(),
  bootstrap: vi.fn(),
  constructed: vi.fn(),
  qualify: vi.fn(),
  database: { isTransaction: true },
  query: vi.fn(),
}));
vi.mock("./product-command-authority.js", () => ({
  withProductCommandAuthority: transport,
}));
vi.mock("./kysely-authoring-repository.js", () => ({
  KyselyMetaEntityAuthoringRepository: class {
    constructor(...args: unknown[]) {
      constructed(...args);
    }
    executeNativeConversion = conversion;
    executeNativeBootstrap = bootstrap;
    executeHistoricalOwnershipInitialization = ownership;
    executeHistoricalIdentityInstallation = identities;
  },
}));
vi.mock("./native-schema-qualification.js", () => ({
  withCanonicalNativeSchemaQualification: qualify,
  qualifyCanonicalNativeSchema: qualify,
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
function fixture(
  nativeConversion?: ProductReferenceEnrollmentOptions["nativeConversion"],
) {
  const resolvePolicies = vi.fn(async (..._args: unknown[]) => ({
    ownership: { authoringSchemaHash: "a".repeat(64) },
    identities: { authoringSchemaHash: "a".repeat(64) },
  }));
  const service = createProductReferenceEnrollment({
    database,
    authority: {},
    resolvePolicies,
    nativeConversion,
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

it("does not issue native admission without installed conversion and audit", async () => {
  await expect(
    fixture().service.convertNative(context, command),
  ).rejects.toMatchObject({ code: "NATIVE_CONVERSION_HOST_NOT_CONFIGURED" });
  expect(transport).not.toHaveBeenCalled();
});
it("qualifies the schema and audits canonical conversion and replay in the admitted transaction", async () => {
  const policy = {
    host: { commands: { authoringSchemaHash: "a".repeat(64) } },
  };
  const schema = {
    database: "athyper_studio",
    applicationRole: "product_writer",
    schemaHash: "b".repeat(64),
  };
  const wrapped = { ...policy, qualified: true };
  const resolve = vi.fn(async () => ({ policy, schema }));
  const audit = vi.fn();
  const f = fixture({ resolve, audit } as unknown as NonNullable<
    ProductReferenceEnrollmentOptions["nativeConversion"]
  >);
  qualify.mockReturnValue(wrapped);
  const result = {
    changeSetId: "draft",
    revision: 3,
    changed: true,
    sourceHash: command.expectedSourceHash,
    targetHash: "c".repeat(64),
  };
  conversion.mockResolvedValue(result);
  for (let i = 0; i < 2; i++)
    expect(await f.service.convertNative(context, command)).toEqual(result);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[0]![0].command.kind).toBe(
    "native-format-conversion",
  );
  expect(qualify).toHaveBeenCalledWith(policy, schema);
  expect(constructed.mock.calls[0]?.[0]).toBe(database);
  expect(constructed.mock.calls[0]?.[5]).toBe(wrapped);
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(f.resolvePolicies).not.toHaveBeenCalled();
  expect(audit).toHaveBeenCalledWith(
    database,
    context,
    { ...command, actorId: "actor", tenantId: null },
    result,
  );
});
it("propagates audit failure inside the transaction and rejects absent schema before writing", async () => {
  const resolve = vi.fn(async () => ({ policy: {}, schema: undefined }));
  const audit = vi.fn(async () => {
    throw Error("audit unavailable");
  });
  const f = fixture({ resolve, audit } as unknown as NonNullable<
    ProductReferenceEnrollmentOptions["nativeConversion"]
  >);
  await expect(f.service.convertNative(context, command)).rejects.toMatchObject(
    { code: "NATIVE_CONVERSION_HOST_NOT_CONFIGURED" },
  );
  expect(conversion).not.toHaveBeenCalled();
  resolve.mockResolvedValue({ policy: {}, schema: {} as never });
  qualify.mockReturnValue({ host: {} });
  conversion.mockResolvedValue({ revision: 3 });
  await expect(f.service.convertNative(context, command)).rejects.toThrow(
    "audit unavailable",
  );
});

it("native bootstrap requires entity-bound creation admission and qualifies schema on replay", async () => {
  const policy = {
    host: {},
    qualify: vi.fn(),
    prepare: vi.fn(),
    audit: vi.fn(),
  };
  const schema = { schemaHash: "a".repeat(64) };
  const resolve = vi.fn(async () => ({ policy, schema }));
  const service = createProductReferenceEnrollment({
    database,
    authority: {},
    resolvePolicies: vi.fn(),
    nativeBootstrap: { resolve },
  } as unknown as ProductReferenceEnrollmentOptions);
  const input = {
    changeSetId: "draft",
    entityId: "entity",
    proposalHash: "a".repeat(64),
    idempotencyKey: "bootstrap-command-001",
  };
  query.mockResolvedValue({ rows: [{ allowed: true }] });
  bootstrap.mockImplementation(async (coordinate) => {
    await constructed.mock.calls.at(-1)![10].qualify(database, coordinate);
    return { revision: 1, replay: true };
  });
  expect(await service.bootstrapNative(context, input)).toEqual({
    revision: 1,
    replay: true,
  });
  expect(transport.mock.calls[0]![0].scope).toEqual({
    authorityTenantId: "platform",
    actorId: "actor",
    changeSetId: "draft",
    creationEntityId: "entity",
  });
  expect(qualify).toHaveBeenCalledWith(database, schema);
  expect(policy.qualify).toHaveBeenCalledWith(database, {
    ...input,
    actorId: "actor",
    tenantId: null,
  });
  qualify.mockRejectedValueOnce(new Error("NATIVE_SCHEMA_NOT_READY"));
  await expect(service.bootstrapNative(context, input)).rejects.toThrow(
    "NATIVE_SCHEMA_NOT_READY",
  );
  query.mockResolvedValue({ rows: [{ allowed: false }] });
  resolve.mockClear();
  await expect(service.bootstrapNative(context, input)).rejects.toMatchObject({
    code: "PRODUCT_REFERENCE_ADMISSION_REQUIRED",
  });
  expect(resolve).not.toHaveBeenCalled();
});
it("native bootstrap rejects missing installation and caller authority injection", async () => {
  const input = {
    changeSetId: "draft",
    entityId: "entity",
    proposalHash: "a".repeat(64),
    idempotencyKey: "bootstrap-command-001",
  };
  await expect(
    fixture().service.bootstrapNative(context, input),
  ).rejects.toMatchObject({ code: "NATIVE_BOOTSTRAP_HOST_NOT_CONFIGURED" });
  const service = createProductReferenceEnrollment({
    database,
    authority: {},
    resolvePolicies: vi.fn(),
    nativeBootstrap: { resolve: vi.fn() },
  } as unknown as ProductReferenceEnrollmentOptions);
  for (const extra of [
    { actorId: "other" },
    { tenantId: "other" },
    { policy: {} },
    { schema: {} },
  ])
    await expect(
      service.bootstrapNative(context, { ...input, ...extra }),
    ).rejects.toMatchObject({ code: "PRODUCT_REFERENCE_INPUT_INVALID" });
  expect(transport).not.toHaveBeenCalled();
});
