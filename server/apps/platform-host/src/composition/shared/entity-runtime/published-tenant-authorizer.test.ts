import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import {
  compileGraph,
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  createPublishedTenantRecordAuthorizer,
  createInMemoryRecordPersistence,
  createRecordQueryService,
} from "@athyper/server-service-records";
import { assertEntityAuthorizationEnforceable } from "../publication/entity-authorization-activation.js";
import { lowerNativeRuntimePublication } from "@athyper/server-service-publication";
import { parseEntityRuntimeDescriptor } from "@athyper/server-platform-metadata";

const source = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../../metadata/products/shared/entities/country/definition.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const id = "11111111-1111-4111-8111-111111111111";
function fixture(plane: "studio" | "neon" | "mesh") {
  const { graph } = compileSharedReferenceProduct(
    parseSharedReferenceProduct(source),
    plane,
  );
  const saved = {
    ...graph,
    operationPermissions: graph.operationPermissions!.map((b, i) => ({
      ...b,
      id: `00000000-0000-4000-8000-${String(10 + i).padStart(12, "0")}`,
    })),
    operationScopeBindings: graph.operationScopeBindings!.map((b, i) => ({
      ...b,
      id: `00000000-0000-4000-8000-${String(20 + i).padStart(12, "0")}`,
    })),
  };
  const artifact = compileGraph(saved);
  const lowered = lowerNativeRuntimePublication(
    {
      releaseId: id,
      releaseNo: 1,
      publicationKey: "metadata.entity.country",
      plane,
      tenantId: null,
      entityCode: "country",
      revisionId: id,
      sourceEntityId: id,
      sourceReleaseHash: artifact.descriptorHash,
      sourceContractHash: artifact.contractHash,
      sourceDescriptorHash: artifact.descriptorHash,
      generatedAt: "2026-09-30T00:00:00.000Z",
      native: artifact.descriptor as unknown as Record<string, unknown>,
      contract: saved as unknown as Record<string, unknown>,
    },
    {
      registration: {
        entityCode: "country",
        plane,
        storage: { schema: "shared", object: "country", idField: "id" },
        columns: graph.fields.map((f) => f.storagePath!),
        detailRouteTemplate: "/app/entity/country/:recordId",
      },
      permissions: [
        {
          id,
          code: "common.platform.reference.view",
          kind: "capability",
          scopeKinds: ["tenant"],
        },
      ],
    },
  );
  let descriptor = parseEntityRuntimeDescriptor({
    entity_code: "country",
    plane_code: plane,
    release_id: id,
    release_no: 1,
    entity_contract_hash: artifact.contractHash,
    compiled_hash: artifact.descriptorHash,
    compiled_json: lowered.runtimeContracts!.country,
  });
  const context = {
    tenantId: "tenant-a",
    principalId: "actor",
    planeKey: plane,
    permissions: { allowed: ["common.platform.reference.view"] },
  } as unknown as VerifiedRequestContext;
  const memory = createInMemoryRecordPersistence();
  memory.seed(descriptor, context.tenantId, [
    { id, code: "MY", name: "Malaysia", is_active: true },
  ]);
  const metadata = { getEntityDescriptor: async () => descriptor };
  const refreshContext = vi.fn(async () => context);
  const exists = vi.fn(async (c, d, recordId) =>
    Boolean(
      await memory.repository.get(d, c.tenantId, recordId, [d.storage.idField]),
    ),
  );
  const authorize = vi.fn<Authorizer["authorize"]>(async (r) =>
    r.context.permissions.allowed.includes(r.permissionCode)
      ? { allowed: true }
      : { allowed: false, reason: "missing_permission" },
  );
  const authorizer = createPublishedTenantRecordAuthorizer({
    authority: { authorize },
    metadata,
    refreshContext,
    exists,
  });
  return {
    context,
    authorize,
    authorizer,
    exists,
    refreshContext,
    descriptor,
    replace: (d: EntityRuntimeDescriptor) => {
      descriptor = d;
    },
    queries: createRecordQueryService({ ...memory, metadata, authorizer }),
  };
}

it.each(["studio", "neon", "mesh"] as const)(
  "enforces Country's real published profile on %s",
  async (plane) => {
    const f = fixture(plane);
    expect(() =>
      assertEntityAuthorizationEnforceable([f.descriptor], plane, f.authorizer),
    ).not.toThrow();
    expect(
      (
        await f.queries.list({
          context: f.context,
          entityCode: "country",
          fields: ["id", "code", "name"],
        })
      ).data[0],
    ).toMatchObject({ code: "MY" });
    expect(
      (
        await f.queries.get({
          context: f.context,
          entityCode: "country",
          recordId: id,
        })
      ).data,
    ).toMatchObject({ name: "Malaysia" });
    f.refreshContext.mockResolvedValue({
      ...f.context,
      permissions: { ...f.context.permissions, allowed: [] },
    });
    await expect(
      f.queries.list({ context: f.context, entityCode: "country" }),
    ).rejects.toThrow();
  },
);

it("uses qualified collection authorization for Country exact aggregates", async () => {
  const f = fixture("neon");
  await expect(
    f.queries.list({
      context: f.context,
      entityCode: "country",
      countMode: "exact",
    }),
  ).resolves.toMatchObject({ pagination: { total: 1 } });
  expect(
    f.authorizer.aggregateAuthorizationCovered?.(f.context, f.descriptor),
  ).toBe(true);
  expect(f.exists).not.toHaveBeenCalled();
});

it("denies identity changes and removed runtime bindings", async () => {
  const f = fixture("neon");
  f.refreshContext.mockResolvedValue({ ...f.context, tenantId: "tenant-b" });
  await expect(
    f.queries.get({ context: f.context, entityCode: "country", recordId: id }),
  ).rejects.toThrow();
  f.refreshContext.mockResolvedValue(f.context);
  f.replace({
    ...f.descriptor,
    authorizationRuntime: {
      ...f.descriptor.authorizationRuntime!,
      bindings: [],
    },
  });
  await expect(
    f.queries.list({ context: f.context, entityCode: "country" }),
  ).rejects.toThrow("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
});

it("preserves the separate capability permission boundary after parent admission", async () => {
  const f = fixture("neon");
  await expect(
    f.queries.get({ context: f.context, entityCode: "country", recordId: id }),
  ).resolves.toMatchObject({ data: { id } });
  // This is the resource shape used by the shared capability policy after its
  // parent admission. It must not be interpreted as a profile read operation.
  const resource = {
    tenantId: f.context.tenantId,
    resourceCode: "country",
    resourceId: id,
    recordId: id,
    entityType: "country",
    entityId: id,
  };
  const permissionCode = "common.document.attachment.download";
  expect(
    await f.authorizer.authorize({
      context: f.context,
      permissionCode,
      resource,
    }),
  ).toMatchObject({ allowed: false });
  const context = {
    ...f.context,
    permissions: {
      ...f.context.permissions,
      allowed: [...f.context.permissions.allowed, permissionCode],
    },
  };
  expect(
    await f.authorizer.authorize({ context, permissionCode, resource }),
  ).toMatchObject({ allowed: true });
});

it("rejects a release replacement during authorization", async () => {
  const f = fixture("neon");
  f.refreshContext.mockImplementation(async () => {
    f.replace({ ...f.descriptor, compiledHash: "f".repeat(64) });
    return f.context;
  });
  await expect(
    f.queries.get({ context: f.context, entityCode: "country", recordId: id }),
  ).rejects.toThrow();
});

it("masks protected values and denies querying masked fields", async () => {
  const f = fixture("neon");
  const policies = f.descriptor.authorization!.fieldPolicies;
  const descriptor = {
    ...f.descriptor,
    authorization: {
      ...f.descriptor.authorization!,
      fieldPolicies: [
        ...policies.map((p) => ({
          ...p,
          fields: p.fields.filter((key) => key !== "name"),
        })),
        {
          ...policies[0]!,
          key: "masked_name",
          fields: ["name"],
          representation: "masked" as const,
        },
      ],
    },
  };
  f.replace(descriptor);
  expect(() =>
    assertEntityAuthorizationEnforceable([descriptor], "neon", f.authorizer),
  ).not.toThrow();
  expect(
    (
      await f.queries.get({
        context: f.context,
        entityCode: "country",
        recordId: id,
      })
    ).data?.name,
  ).toBe("••••");
  await expect(
    f.queries.list({
      context: f.context,
      entityCode: "country",
      search: "Malaysia",
    }),
  ).rejects.toThrow();
});

// Synthetic entities deliberately have no relationship to their permission names.
// Published bindings, rather than a domain allowlist, must select exact permissions.
it.each(["studio", "neon", "mesh"] as const)(
  "admits valid omitted operation permissions without losing tenant or operation boundaries on %s",
  async (plane) => {
    const f = fixture(plane);
    const omitPermission = <T extends { permissionCode?: string }>(value: T) => {
      const { permissionCode: _permission, ...rest } = value;
      return rest;
    };
    const descriptor = {
      ...f.descriptor,
      operations: Object.fromEntries(Object.entries(f.descriptor.operations).map(
        ([key, operation]) => [key, omitPermission(operation)],
      )),
      authorization: {
        ...f.descriptor.authorization!,
        operations: f.descriptor.authorization!.operations.map(omitPermission),
      },
    };
    f.replace(descriptor);
    const context = { ...f.context, permissions: {
      ...f.context.permissions,
      tenantId: f.context.tenantId,
      principalId: f.context.principalId,
      planeKey: plane,
      allowed: [],
    } };
    f.refreshContext.mockResolvedValue(context);
    expect((await f.queries.list({ context, entityCode: descriptor.entityCode })).data).toHaveLength(1);
    expect((await f.queries.get({ context, entityCode: descriptor.entityCode, recordId: id })).data).toMatchObject({ name: "Malaysia" });
    expect(f.authorize).not.toHaveBeenCalled();
    await expect(f.queries.list({ context: { ...context, tenantId: "another-tenant" }, entityCode: descriptor.entityCode })).rejects.toThrow();
    const { list: _list, ...operations } = descriptor.operations;
    f.replace({ ...descriptor, operations });
    await expect(f.queries.list({ context, entityCode: descriptor.entityCode })).rejects.toThrow();
  },
);

it.each(["studio", "neon", "mesh"] as const)(
  "uses metadata permissions for previously unknown entities on %s",
  async (plane) => {
    const f = fixture(plane);
    const entityCode = "review_fixture_asset";
    const permissionCode = "catalog.fixture.inspect";
    const descriptor = {
      ...f.descriptor,
      entityCode,
      operations: Object.fromEntries(Object.entries(f.descriptor.operations).map(
        ([key, operation]) => [key, { ...operation, permissionCode }],
      )),
      authorization: {
        ...f.descriptor.authorization!,
        entityCode,
        operations: f.descriptor.authorization!.operations.map(operation => ({
          ...operation, permissionCode,
        })),
      },
    };
    f.replace(descriptor);
    f.refreshContext.mockResolvedValue({
      ...f.context,
      permissions: { ...f.context.permissions, allowed: [permissionCode] },
    });
    const request = {
      context: f.context,
      permissionCode,
      resource: { tenantId: f.context.tenantId, entityCode, operationKey: "list" },
    };
    expect(await f.authorizer.authorize(request)).toMatchObject({ allowed: true });
    expect(f.authorize).toHaveBeenLastCalledWith(expect.objectContaining({
      permissionCode,
      resource: expect.objectContaining({ entityCode, operationKey: "list" }),
    }));

    // Even a valid IAM grant cannot replace the permission bound in metadata.
    f.authorize.mockClear();
    expect(await f.authorizer.authorize({
      ...request, permissionCode: "catalog.fixture.other",
    })).toMatchObject({ allowed: false, reason: "entity_authorization_unmapped" });
    expect(f.authorize).not.toHaveBeenCalled();

    // A supported published descriptor must never convert a policy denial to allow.
    f.authorize.mockResolvedValue({
      allowed: false, reason: "hard_policy_evidence_required",
    });
    expect(await f.authorizer.authorize(request)).toMatchObject({
      allowed: false, reason: "hard_policy_evidence_required",
    });
  },
);
