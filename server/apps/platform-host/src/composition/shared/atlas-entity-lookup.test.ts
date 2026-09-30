import { expect, it } from "vitest";
import {
  createAtlasEntityLookupTools,
  createAtlasRecordDataGateway,
} from "@athyper/server-platform-ai";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import {
  createInMemoryRecordPersistence,
  createRecordListExecutor,
  createRecordQueryService,
} from "@athyper/server-service-records";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "10000000-0000-4000-8000-000000000002",
  id = "10000000-0000-4000-8000-000000000003";
it("cross-entity lookup uses real Records and IAM boundaries, including field and tenant denial", async () => {
  const d: EntityRuntimeDescriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: "reference_example",
    planeKey: "neon",
    releaseId: id,
    releaseNo: 1,
    compiledHash: "hash",
    contractHash: "contract",
    storage: {
      schema: "master",
      object: "reference_example",
      idField: "id",
      tenantField: "tenant_id",
      versionField: "version",
    },
    fields: [
      {
        key: "id",
        storagePath: "id",
        type: "uuid",
        required: true,
        writableOn: [],
        filterable: true,
        classification: "internal",
      },
      {
        key: "name",
        storagePath: "name",
        type: "string",
        required: true,
        writableOn: [],
        searchable: true,
        filterable: true,
        classification: "public",
        list: { label: "Name" },
      },
      {
        key: "value",
        storagePath: "value",
        type: "string",
        required: false,
        writableOn: [],
        classification: "public",
        list: { label: "Published value" },
      },
      {
        key: "secret",
        storagePath: "secret",
        type: "string",
        required: false,
        writableOn: [],
        classification: "public",
        readPermissionCode: "secret.read",
      },
      {
        key: "version",
        storagePath: "version",
        type: "integer",
        required: true,
        writableOn: [],
      },
    ],
    operations: { read: { code: "read", permissionCode: "reference.read" } },
    ai: {
      schemaVersion: 1,
      enabled: true,
      aliases: ["reference"],
      summaryFieldKeys: ["name", "value", "secret"],
      searchFieldKeys: ["name"],
      relationshipKeys: [],
      contextKinds: ["manage"],
      insightProviders: [{ id: "entity_lookup", version: 1 }],
      actions: [],
      presentationProfiles: [],
    },
  };
  const context: VerifiedRequestContext = {
    planeKey: "neon",
    realmKey: "neon",
    tenantId: tenant,
    principalId: actor,
    authEpoch: 1,
    profileHash: "p",
    requestId: "r",
    assurance: "baseline",
    permissions: {
      planeKey: "neon",
      tenantId: tenant,
      principalId: actor,
      profileHash: "p",
      principalFingerprint: "actor",
      schemaHash: "s",
      resolvedAt: 1,
      allowed: ["reference.read"],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
    },
  };
  const metadata = {
    getEntityDescriptor: async () => d,
    listEntityCodes: async () => [d.entityCode],
  };
  const authorizer = createPermissionAuthorizer();
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(d, tenant, [
    {
      id,
      name: "Named record",
      value: "safe",
      secret: "NEVER_DISCLOSE",
      version: 1,
    },
  ]);
  const options = { metadata, authorizer, ...persistence };
  const records = createRecordQueryService(
    options,
    createRecordListExecutor(options),
  );
  const gateway = createAtlasRecordDataGateway({
    metadata,
    records,
    maxRows: 3,
    maxResponseBytes: 8192,
    fieldSecurity: { project: async ({ rows }) => rows },
  });
  const tool = createAtlasEntityLookupTools(metadata, authorizer).find(
    (t) => t.manifest.toolCode === "entity_lookup",
  )!;
  const args = {
    entityCode: d.entityCode,
    descriptorHash: "hash",
    searchField: "name",
    value: "Named record",
    fields: ["value"],
  };
  const read = (c = context, a: Record<string, unknown> = args) =>
    tool.readHandler!.execute({
      context: {
        context: c,
        records: gateway,
        signal: new AbortController().signal,
      },
      arguments: a,
    });
  const result = await read();
  expect(JSON.stringify(result)).toContain("safe");
  expect(JSON.stringify(result)).not.toContain("NEVER_DISCLOSE");
  expect(result.sources[0]?.coordinate.recordId).toBe(id);
  await expect(
    read(context, { ...args, fields: ["secret"] }),
  ).rejects.toThrow();
  await expect(
    read({
      ...context,
      permissions: { ...context.permissions, denied: ["reference.read"] },
    }),
  ).rejects.toThrow();
  const other = {
    ...context,
    tenantId: actor,
    permissions: { ...context.permissions, tenantId: actor },
  };
  expect((await read(other)).data).toMatchObject({
    match: "no_authorized_match",
    items: [],
  });
  await expect(
    read({
      ...context,
      planeKey: "mesh",
      permissions: { ...context.permissions, planeKey: "mesh" },
    }),
  ).rejects.toThrow();
});
