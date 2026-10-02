import { expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPublishedTenantRecordAuthorizer } from "./published-tenant-authorizer.js";
import {
  createRecordQueryService,
  createRecordListExecutor,
} from "./query-service.js";
import { createEntityListService } from "./entity-list-service.js";
import { assertExportFieldAdmission } from "./transfer/export-admission.js";

const context = {
  tenantId: "tenant",
  principalId: "actor",
  planeKey: "neon",
  realmKey: "realm",
  authEpoch: 1,
  profileHash: "profile",
  requestId: "request",
  permissions: { principalFingerprint: "actor" },
} as VerifiedRequestContext;
const id = "11111111-1111-4111-8111-111111111111";
function fixture(exportEnabled = false) {
  const keys = exportEnabled ? ["list", "read", "export"] : ["list", "read"];
  const descriptor = {
    entityCode: "sample",
    planeKey: "neon",
    releaseId: "release",
    releaseNo: 1,
    compiledHash: "a".repeat(64),
    storage: {
      schema: "master",
      object: "sample",
      idField: "id",
      tenantField: "tenant_id",
    },
    fields: [
      {
        key: "id",
        storagePath: "id",
        writableOn: [],
        type: "uuid",
        required: true,
        classification: "internal",
      },
      {
        key: "secret",
        storagePath: "secret",
        writableOn: [],
        type: "string",
        required: false,
        classification: "pii",
        filterable: true,
        sortable: true,
        searchable: true,
        list: { groupable: true },
        validation: { options: [{ value: "raw-secret", label: "raw-secret" }] },
      },
    ],
    operations: {
      read: { code: "read", permissionCode: "sample.read" },
      list: { code: "list", permissionCode: "sample.read" },
      ...(exportEnabled
        ? { export: { code: "export", permissionCode: "sample.read" } }
        : {}),
    },
    listPresentation: {
      identityField: "id",
      title: "Samples",
      search: { profileKey: "default" },
    },
    authorizationRuntime: {
      schemaVersion: 1,
      runtimeVersion: "entity-authorization.v1",
      bindings: keys.map((operation) => ({
        operation,
        handler: `entity.record.${operation}.v1`,
        resolver: "tenant.record.v1",
      })),
    },
    authorization: {
      schemaVersion: 1,
      entityCode: "sample",
      planeKey: "neon",
      ownership: "tenant.record.v1",
      directory: { operation: "list", population: "tenant" },
      recordReadOperation: "read",
      operations: keys.map((key) => ({
        key,
        permissionCode: "sample.read",
        scope: "tenant.record.v1",
        target: key !== "read" ? "collection" : "existing",
        effect: "read",
        requiresParentRead: false,
        requiresPreflight: false,
      })),
      fieldPolicies: [
        {
          key: "identity",
          fields: ["id"],
          readOperation: "read",
          representation: "plain",
          writeOperations: [],
          queryUses: exportEnabled ? ["export"] : [],
        },
        {
          key: "protected",
          fields: ["secret"],
          readOperation: "read",
          representation: "masked",
          writeOperations: [],
          queryUses: ["search", "filter", "sort", "group"],
        },
      ],
      surfaces: [],
      relationships: [],
    },
  } as unknown as EntityRuntimeDescriptor;
  const metadata = { getEntityDescriptor: async () => descriptor };
  const authority = {
    authorize: vi.fn(async () => ({ allowed: true as const })),
  };
  const authorizer = createPublishedTenantRecordAuthorizer({
    metadata,
    authority,
    refreshContext: async (ctx) => ctx,
    exists: async () => true,
  });
  const raw = { id, secret: "raw-secret" };
  const repository = {
    list: vi.fn(async () => ({
      data: [raw],
      pagination: { pageSize: 1, hasMore: false, countMode: "none" },
    })),
    get: vi.fn(async () => raw),
  };
  const transactions = {
    run: async (
      _plane: unknown,
      _context: unknown,
      work: (tx: object) => Promise<unknown>,
    ) => work({}),
  };
  const options = {
    authorizer,
    metadata,
    repository: repository as never,
    transactions: transactions as never,
  };
  const queries = createRecordQueryService(options);
  const filterChoices = vi.fn(async () => ({
    secret: [{ value: "raw-secret", label: "raw-secret" }],
  }));
  const lists = createEntityListService({
    authorizer,
    metadata,
    queries,
    filterChoices,
    listExecutor: createRecordListExecutor(options),
  });
  return {
    descriptor,
    queries,
    lists,
    repository,
    authority,
    filterChoices,
    metadata,
    authorizer,
    transactions,
  };
}

it("uses the installed published authorizer to mask list and detail reads", async () => {
  const f = fixture();
  expect(
    (await f.queries.list({ context, entityCode: "sample" })).data[0]?.secret,
  ).toBe("••••");
  expect(
    (await f.queries.get({ context, entityCode: "sample", recordId: id })).data
      ?.secret,
  ).toBe("••••");
});
it.each([
  { filters: [{ field: "secret", operator: "eq", value: "raw-secret" }] },
  { sort: [{ field: "secret", direction: "asc" }] },
  { group: "secret" },
  { search: "raw-secret" },
])("denies masked query inference before SQL: %j", async (input) => {
  const f = fixture();
  await expect(
    f.queries.list({ context, entityCode: "sample", ...input } as never),
  ).rejects.toMatchObject({
    statusCode: 403,
    code: "ENTITY_FIELD_QUERY_FORBIDDEN",
  });
  expect(f.repository.list).not.toHaveBeenCalled();
});
it("does not enumerate masked filter choices or advertise unsupported controls", async () => {
  const f = fixture();
  const result = await f.lists.descriptor(
    context,
    "sample",
    undefined,
    "secret",
  );
  expect(f.filterChoices).not.toHaveBeenCalled();
  expect(result.fields.find((field) => field.key === "secret")).toMatchObject({
    filterOperators: [],
    sortable: false,
    groupable: false,
  });
  expect(result.surface.search.profileKey).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("raw-secret");
  const detail = await f.lists.detailDescriptor(context, "sample", id);
  expect(JSON.stringify(detail)).not.toContain("raw-secret");
});
it("rejects protected export disclosure and revoked reads", async () => {
  const f = fixture();
  expect(() => assertExportFieldAdmission(f.descriptor, ["secret"])).toThrow(
    expect.objectContaining({ code: "EXPORT_FIELD_CLASSIFICATION_FORBIDDEN" }),
  );
  f.authority.authorize.mockResolvedValue({ allowed: false } as never);
  await expect(
    f.queries.get({ context, entityCode: "sample", recordId: id }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(f.repository.get).not.toHaveBeenCalled();
});

it("enabled exports omit masked fields and recheck worker/download disclosure after policy changes", async () => {
  const { createRecordTransferService } =
    await import("./transfer/transfer-service.js");
  const { createRecordExportHandler } =
    await import("./transfer/transfer-jobs.js");
  const f = fixture(true);
  let request: any,
    artifact = "";
  const saveExportRequest = vi.fn(async (input: unknown) => {
    request = input;
    return "created" as const;
  });
  const createDownloadUrl = vi.fn(
    async () => "https://test.invalid/controlled-artifact",
  );
  const audit = {
    record: vi.fn(async (input: any) => ({ ...input, id: "audit" })),
  };
  const outbox = { append: vi.fn(async () => undefined) };
  const service = createRecordTransferService({
    metadata: f.metadata,
    authorizer: f.authorizer,
    transactions: f.transactions as never,
    staging: {
      saveExportRequest,
      getExport: async () => ({
        ...request,
        status: "completed",
        artifactKey: "test-artifact",
      }),
    } as never,
    validator: {} as never,
    adapters: {} as never,
    jobs: { enqueue: vi.fn(async () => "test-job") },
    audit: audit as never,
    outbox,
    errorReports: { createDownloadUrl } as never,
  });
  await expect(
    service.requestExport(context, "sample", { fields: ["secret"] }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(saveExportRequest).not.toHaveBeenCalled();
  // Classification alone must not admit a masked field, even if it is internal.
  (
    f.descriptor.fields.find((field) => field.key === "secret") as {
      classification: string;
    }
  ).classification = "internal";
  await expect(
    service.requestExport(context, "sample", { fields: ["secret"] }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(
    (await f.lists.descriptor(context, "sample")).dataOperations?.export
      .exportableFields,
  ).toEqual(["id"]);
  const accepted = await service.requestExport(context, "sample", {
    _transfer: { format: "csv" },
  });
  expect(request.exactFilter.fields).toEqual(["id"]);
  const writeExport = vi.fn(async ({ content }: any) => {
    for await (const chunk of content)
      artifact += new TextDecoder().decode(chunk);
    return "test-artifact";
  });
  const worker = createRecordExportHandler({
    metadata: f.metadata,
    authorizer: f.authorizer,
    queries: f.queries,
    transactions: f.transactions as never,
    store: {
      claimExport: async () => request,
      completeExport: vi.fn(),
      failExport: vi.fn(),
      releaseExport: vi.fn(),
    } as never,
    artifacts: { writeExport } as never,
    audit: audit as never,
    outbox,
  });
  const job: any = {
    id: "job",
    queue: "records.transfer",
    name: "records.export.execute",
    attempt: 1,
    maxAttempts: 1,
    enqueuedAt: new Date().toISOString(),
    data: {
      planeKey: "neon",
      tenantId: context.tenantId,
      entityCode: "sample",
      exportRequestId: accepted.exportRequestId,
      actorPrincipalId: context.principalId,
      context,
    },
  };
  const execution: any = {
    signal: new AbortController().signal,
    attempt: 1,
    reportProgress: async () => undefined,
  };
  await worker.handle(job, execution);
  expect(artifact).toContain(id);
  expect(artifact).not.toContain("secret");
  expect(artifact).not.toContain("raw-secret");
  await service.downloadExport(context, accepted.exportRequestId);
  expect(createDownloadUrl).toHaveBeenCalledOnce();
  (
    f.descriptor.fields.find((field) => field.key === "id") as {
      classification: string;
    }
  ).classification = "pii";
  writeExport.mockClear();
  createDownloadUrl.mockClear();
  await expect(worker.handle(job, execution)).rejects.toMatchObject({
    code: "EXPORT_FIELD_CLASSIFICATION_FORBIDDEN",
  });
  await expect(
    service.downloadExport(context, accepted.exportRequestId),
  ).rejects.toMatchObject({ code: "EXPORT_FIELD_CLASSIFICATION_FORBIDDEN" });
  expect(writeExport).not.toHaveBeenCalled();
  expect(createDownloadUrl).not.toHaveBeenCalled();
});
