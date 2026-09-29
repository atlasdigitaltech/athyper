import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import {
  createAuditService,
  createInMemoryAuditSink,
} from "@athyper/server-platform-audit";
import {
  createInMemoryCommandExecutionStore,
  createInMemoryRecordPersistence,
} from "@athyper/server-service-records";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { createEntityServices } from "../services.js";
import { createEntityHttpRegistrars } from "../http.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const first = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const context = {
  planeKey: "neon",
  tenantId,
  principalId: first,
  realmKey: "athyper",
  authEpoch: 1,
  requestId: "test-request",
  profileHash: "test-profile",
  permissions: {
    planeKey: "neon",
    tenantId,
    principalId: first,
    principalFingerprint: "test-fingerprint",
    profileHash: "test-profile",
    schemaHash: "test-schema",
    resolvedAt: 1,
    allowed: [],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
  },
} as VerifiedRequestContext;
const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "test_record",
  planeKey: "neon",
  releaseId: "release-1",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: {
    schema: "master",
    object: "test_record",
    idField: "id",
    tenantField: "tenant_id",
    versionField: "row_version",
  },
  fields: [
    {
      key: "id",
      storagePath: "id",
      type: "uuid",
      required: false,
      writableOn: [],
    },
    {
      key: "tenant_id",
      storagePath: "tenant_id",
      type: "uuid",
      required: false,
      writableOn: [],
    },
    {
      key: "owner_id",
      storagePath: "owner_id",
      type: "uuid",
      required: false,
      writableOn: [],
      filterable: true,
    },
    {
      key: "name",
      storagePath: "name",
      type: "string",
      required: true,
      writableOn: ["create", "patch"],
      searchable: true,
      sortable: true,
      filterable: true,
    },
  ],
  operations: Object.fromEntries(
    ["read", "list", "create", "patch", "delete"].map((code) => [
      code,
      { code, permissionCode: `test.${code}` },
    ]),
  ),
};

function fixture() {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(descriptor, tenantId, [
    {
      id: first,
      tenant_id: tenantId,
      owner_id: first,
      name: "Alpha",
      row_version: 1,
    },
    {
      id: other,
      tenant_id: tenantId,
      owner_id: other,
      name: "Beta",
      row_version: 1,
    },
  ]);
  persistence.seed(descriptor, other, [
    { id: first, tenant_id: other, name: "Other tenant", row_version: 1 },
  ]);
  const owner: EntityRuntimeDescriptor = {
    ...descriptor,
    entityCode: "owner_record",
    storage: { ...descriptor.storage, object: "owner_record" },
    recordPresentation: {
      entityRelationships: [
        {
          key: "children",
          targetEntity: "test_record",
          cardinality: "many",
          fields: [{ source: "id", target: "owner_id" }],
          tenant: { source: "tenant_id", target: "tenant_id" },
          readOperation: "list",
        },
      ],
    } as EntityRuntimeDescriptor["recordPresentation"],
  };
  persistence.seed(owner, tenantId, [
    { id: first, tenant_id: tenantId, name: "Parent", row_version: 1 },
  ]);
  const metadata = {
    getEntityDescriptor: vi.fn(
      async (_context: VerifiedRequestContext, entityCode: string) =>
        entityCode === descriptor.entityCode
          ? descriptor
          : entityCode === owner.entityCode
            ? owner
            : null,
    ),
  };
  const authorizer: Authorizer = {
    authorize: vi.fn(async () => ({
      allowed: true as const,
      scope: {
        tenantWide: true,
        legalEntityIds: [],
        companyCodeIds: [],
        operatingOrganizationIds: [],
        networkMembershipIds: [],
        visibility: "all" as const,
      },
    })),
  };
  const reader = {
    resolve: vi.fn(async () => null),
  } as unknown as PinnedCompiledEntityReader;
  const services = createEntityServices({
    common: {
      metadata,
      authorizer,
      repository: persistence.repository as never,
      transactions: persistence.transactions as never,
      commandExecutions: createInMemoryCommandExecutionStore() as never,
      audit: createAuditService({ sink: createInMemoryAuditSink() }),
      outbox: { append: async () => {} },
    },
    listMetadata: metadata,
    reader,
    activityRegistrations: new Map(),
    historyAdapters: new Map(),
    activityDomainHandlers: new Map(),
  });
  return { services, persistence, metadata, authorizer, reader };
}

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe("shared Entity service composition", () => {
  it("uses the standard query service for tenant isolation, search, sorting and pagination", async () => {
    const { services } = fixture();
    const page = await services.queries.list({
      context,
      entityCode: descriptor.entityCode,
      limit: 1,
      sort: [{ field: "name", direction: "asc" }],
      countMode: "exact",
    });
    expect(page.data.map((row) => row.name)).toEqual(["Alpha"]);
    expect(page.pagination).toMatchObject({ total: 2, hasMore: true });
    const next = await services.queries.list({
      context,
      entityCode: descriptor.entityCode,
      limit: 1,
      sort: [{ field: "name", direction: "asc" }],
      cursor: page.pagination.nextCursor,
    });
    expect(next.data.map((row) => row.name)).toEqual(["Beta"]);
    const search = await services.queries.list({
      context,
      entityCode: descriptor.entityCode,
      search: "Alpha",
    });
    expect(search.data.map((row) => row.id)).toEqual([first]);
  });

  it("passes locked parent constraints separately from caller filters and rejects a missing parent", async () => {
    const { services, persistence } = fixture();
    const list = vi
      .spyOn(persistence.repository, "list")
      .mockResolvedValue({
        data: [],
        pagination: { pageSize: 0, hasMore: false, countMode: "none" },
      });
    const scopeCoordinate = {
      parentEntityCode: "owner_record",
      parentRecordId: first,
      relationshipKey: "children",
    };
    await services.queries.list({
      context,
      entityCode: descriptor.entityCode,
      scopeCoordinate,
      filters: [{ field: "owner_id", operator: "eq", value: other }],
    });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionScope: [
          expect.objectContaining({
            kind: "entity.parent.v1",
            predicates: [{ field: "owner_id", value: first }],
          }),
        ],
        filters: [{ field: "owner_id", operator: "eq", value: other }],
      }),
      expect.anything(),
    );
    list.mockClear();
    await expect(
      services.queries.list({
        context,
        entityCode: descriptor.entityCode,
        scopeCoordinate: { ...scopeCoordinate, parentRecordId: other },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(list).not.toHaveBeenCalled();
  });

  it("pins parent/header reads to the supplied descriptor and still checks authorization", async () => {
    const { services, metadata, authorizer } = fixture();
    metadata.getEntityDescriptor.mockResolvedValue(null);
    expect(
      await services.readPublishedParent(
        { context, entityCode: descriptor.entityCode, recordId: first },
        descriptor,
      ),
    ).toBe(true);
    expect(
      await services.readPublishedHeader(
        { context, recordId: first } as never,
        descriptor,
        ["id", "name"],
      ),
    ).toMatchObject({ id: first, name: "Alpha" });
    vi.mocked(authorizer.authorize).mockResolvedValue({
      allowed: false,
      reason: "missing_permission",
    });
    await expect(
      services.readPublishedParent(
        { context, entityCode: descriptor.entityCode, recordId: first },
        descriptor,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("mounts the existing list/detail and mutation endpoints with explicit authentication", async () => {
    const { services, authorizer } = fixture();
    const routes = createEntityHttpRegistrars({
      services,
      authorizer,
      savedViews: {} as never,
      referenceHistory: {} as never,
      referenceDirectory: () => {
        throw Error("unused");
      },
      activity: {} as never,
      authenticate: (request, response, next) => {
        if (request.header("authorization") !== "Bearer test-token") {
          response.sendStatus(401);
          return;
        }
        next();
      },
      readContext: () => context,
    });
    const app = createHttpApplication({
      configure(application) {
        routes.read(application);
        routes.records(application);
      },
    });
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("listener missing");
    const base = `http://127.0.0.1:${address.port}`,
      headers = {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      };
    expect(
      (await fetch(`${base}/api/entity-runtime/test_record/list`)).status,
    ).toBe(401);
    const list = await fetch(
      `${base}/api/entity-runtime/test_record/list?search=Alpha`,
      { headers },
    );
    expect(list.status, await list.clone().text()).toBe(200);
    expect((await list.json()).rows).toHaveLength(1);
    const detail = await fetch(
      `${base}/api/entity-runtime/test_record/records/${first}`,
      { headers },
    );
    expect(detail.status, await detail.clone().text()).toBe(200);
    const created = await fetch(`${base}/api/records/test_record`, {
      method: "POST",
      headers: { ...headers, "idempotency-key": "entity-composition-create-1" },
      body: JSON.stringify({ name: "Created" }),
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const result = await created.json();
    expect(
      (
        await services.queries.get({
          context,
          entityCode: descriptor.entityCode,
          recordId: result.recordId,
        })
      ).data?.name,
    ).toBe("Created");
    vi.mocked(authorizer.authorize).mockResolvedValue({
      allowed: false,
      reason: "missing_permission",
    });
    expect(
      (await fetch(`${base}/api/entity-runtime/test_record/list`, { headers }))
        .status,
    ).toBe(403);
  });
});
