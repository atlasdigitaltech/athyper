import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  compileTableEntityProduct,
  parseTableEntityProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  lowerNativeRuntimePublication,
  compileCompiledEntityArtifacts,
} from "@athyper/server-service-publication";
import { parseCompiledRuntimeContract } from "@athyper/server-platform-metadata";
import { createPublishedTenantRecordAuthorizer } from "@athyper/server-service-records";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertEntityAuthorizationEnforceable } from "../publication/entity-authorization-activation.js";
const digest = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
function fixture(code: string, plane: "studio" | "neon" | "mesh" = "neon") {
  const product = parseTableEntityProduct(
    JSON.parse(
      readFileSync(
        new URL(
          `../../../../../../../metadata/products/shared/entities/${code}/definition.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );

  const { graph, artifact } = compileTableEntityProduct(product, plane),
    profile = graph.runtimeProfiles![0]!;
  const permissions = [
    ...new Set(graph.operationPermissions!.map((p) => p.permissionCode)),
  ].map((code, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    code,
    kind: "capability",
    scopeKinds: ["tenant"],
  }));
  const lowered = lowerNativeRuntimePublication(
    {
      releaseId: "00000000-0000-4000-8000-000000000090",
      releaseNo: 1,
      publicationKey: `metadata.entity.${code}`,
      plane,
      tenantId: null,
      entityCode: code,
      revisionId: "00000000-0000-4000-8000-000000000091",
      sourceEntityId: "00000000-0000-4000-8000-000000000092",
      sourceReleaseHash: artifact.descriptorHash,
      sourceContractHash: artifact.contractHash,
      sourceDescriptorHash: artifact.descriptorHash,
      generatedAt: "2026-09-29T00:00:00.000Z",
      native: artifact.descriptor as unknown as Record<string, unknown>,
      contract: graph as unknown as Record<string, unknown>,
    },
    {
      registration: {
        entityCode: code,
        plane,
        storage: {
          schema: "master",
          object: profile.storageObject!,
          idField: "id",
          tenantField: "tenant_id",
          ...(profile.recordVersionFieldKey
            ? { versionField: profile.recordVersionFieldKey }
            : {}),
        },
        columns: graph.fields.map((f) => f.storagePath!),
        detailRouteTemplate: `/app/entity/${code}/:recordId`,
      },
      permissions,
    },
  );
  expect(lowered.runtimeContracts![code]).toMatchObject({
    storage: { tenantField: "tenant_id" },
  });
  const compiled = compileCompiledEntityArtifacts({
    ...lowered,
    registry: {
      sourceObjects: new Set([`master.${code}`]),
      permissions: new Set(permissions.map((p) => p.code)),
      handlers: new Set([
        "entity.record.list.v1",
        "entity.record.read.v1",
        "entity.record.create.v1",
        "entity.record.patch.v1",
        "platform.notifications.preferences.v1",
      ]),
      resolvers: new Set(["tenant.record.v1"]),
      renderers: new Set(),
      evaluators: new Set(),
    },
    canonicalizer: {
      canonicalBytes: (value) => Buffer.from(JSON.stringify(value)),
      sha256: (bytes) => `sha256:${digest(bytes)}`,
    },
  });
  return { graph, compiled };
}
const self = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
function setup(code = "principal", plane: "studio" | "neon" | "mesh" = "neon") {
  const { compiled } = fixture(code, plane);
  const descriptor = parseCompiledRuntimeContract(
    compiled.artifacts.find(
      (a) => a.artifact.artifactType === "runtime_contract",
    )!.artifact,
    { releaseId: self, releaseNo: 1 },
  );
  const context = {
    tenantId: self,
    principalId: self,
    planeKey: plane,
    permissions: { principalFingerprint: "self", schemaHash: "schema" },
  } as unknown as VerifiedRequestContext;
  const authority = {
    authorize: vi.fn(async (_r: any) => ({ allowed: true as const })),
  };
  const exists = vi.fn(async (_c: any, _d: any, id: string) => id === self);
  const refreshContext = vi.fn(async () => context);
  const options = {
    authority,
    metadata: { getEntityDescriptor: async () => descriptor },
    exists,
    refreshContext,
  };
  const authorizer = createPublishedTenantRecordAuthorizer({
    ...options,
    ownerAccess: true,
  });
  const request = (operationKey: string, resource = {}) => ({
    context,
    permissionCode: descriptor.operations[operationKey]!.permissionCode,
    resource: { tenantId: self, entityCode: code, operationKey, ...resource },
  });
  return {
    descriptor,
    context,
    authority,
    exists,
    refreshContext,
    options,
    authorizer,
    request,
  };
}
for (const code of [
  "principal",
  "principal_profile",
  "principal_notification_preference",
])
  it.each(["studio", "neon", "mesh"] as const)(
    `qualifies and reads the published ${code} on %s`,
    async (plane) => {
      const f = setup(code, plane);
      expect(() =>
        assertEntityAuthorizationEnforceable(
          [f.descriptor],
          plane,
          f.authorizer,
        ),
      ).not.toThrow();
      expect(() =>
        assertEntityAuthorizationEnforceable(
          [f.descriptor],
          plane,
          createPublishedTenantRecordAuthorizer(f.options),
        ),
      ).toThrow("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
      expect(await f.authorizer.authorize(f.request("list"))).toMatchObject({
        allowed: true,
      });
      expect(
        await f.authorizer.authorize(f.request("read", { recordId: self })),
      ).toMatchObject({ allowed: true });
      expect(
        await f.authorizer.authorize(f.request("read", { recordId: other })),
      ).toMatchObject({ allowed: false });
      expect(
        await f.authorizer.authorize(f.request("list", { tenantId: other })),
      ).toMatchObject({ allowed: false });
      f.refreshContext.mockResolvedValue({ ...f.context, principalId: other });
      expect(await f.authorizer.authorize(f.request("list"))).toMatchObject({
        allowed: false,
      });
    },
  );
it("keeps owner admin checks separate from published operation permissions", async () => {
  const f = setup();
  const admin = {
    ...f.request("list", { ownerAccessCheck: true }),
    permissionCode: f.descriptor.ownerAccess!.administerPermission,
  };
  expect(await f.authorizer.authorize(admin)).toMatchObject({ allowed: true });
  expect(
    await f.authorizer.authorize({
      ...admin,
      resource: { ...admin.resource, ownerAccessCheck: false },
    }),
  ).toMatchObject({ allowed: false });
  expect(
    await f.authorizer.authorize(f.request("list", { ownerAccessCheck: true })),
  ).toMatchObject({ allowed: false });
  f.authority.authorize.mockResolvedValue({ allowed: false } as any);
  expect(await f.authorizer.authorize(admin)).toMatchObject({ allowed: false });
  expect(await f.authorizer.authorize(f.request("list"))).toMatchObject({
    allowed: false,
  });
});
it.each(["principal_profile", "principal_notification_preference"])(
  "checks published writable fields and existing owner scope for %s",
  async (code) => {
    const f = setup(code);
    const field = f.descriptor.fields.find((f) =>
      f.writableOn.includes("patch"),
    )!.key;
    expect(
      await f.authorizer.authorize(
        f.request("create", { authorizationWriteFields: [field] }),
      ),
    ).toMatchObject({ allowed: true });
    expect(
      await f.authorizer.authorize(
        f.request("patch", {
          recordId: self,
          authorizationWriteFields: [field],
        }),
      ),
    ).toMatchObject({ allowed: true });
    expect(
      await f.authorizer.authorize(
        f.request("patch", {
          recordId: other,
          authorizationWriteFields: [field],
        }),
      ),
    ).toMatchObject({ allowed: false });
    expect(
      await f.authorizer.authorize(f.request("patch", { field })),
    ).toMatchObject({ allowed: true });
    expect(
      await f.authorizer.authorize(
        f.request("patch", {
          recordId: self,
          authorizationWriteFields: [f.descriptor.ownerAccess!.ownerField],
        }),
      ),
    ).toMatchObject({ allowed: false });
    expect(
      await f.authorizer.authorize(
        f.request("patch", { field: f.descriptor.ownerAccess!.ownerField }),
      ),
    ).toMatchObject({ allowed: false });
    expect(await f.authorizer.authorize(f.request("patch"))).toMatchObject({
      allowed: false,
    });
  },
);
it("rejects unsupported ownership profiles at activation", () => {
  const f = setup("principal_profile");
  for (const descriptor of [
    {
      ...f.descriptor,
      storage: { ...f.descriptor.storage, tenantField: undefined },
    },
    {
      ...f.descriptor,
      storage: { ...f.descriptor.storage, versionField: undefined },
    },
    {
      ...f.descriptor,
      ownerAccess: { ...f.descriptor.ownerAccess!, ownerField: "display_name" },
    },
    {
      ...f.descriptor,
      authorizationRuntime: {
        ...f.descriptor.authorizationRuntime!,
        bindings: [],
      },
    },
  ])
    expect(() =>
      assertEntityAuthorizationEnforceable([descriptor], "neon", f.authorizer),
    ).toThrow();
});

it("rejects stale publication pins and restricted admin scopes", async () => {
  const f = setup();
  expect(
    await f.authorizer.authorize(
      f.request("list", { authorizationDescriptorHash: "stale" }),
    ),
  ).toMatchObject({ allowed: false });
  expect(
    await f.authorizer.authorize(
      f.request("list", { authorizationProfileHash: "stale" }),
    ),
  ).toMatchObject({ allowed: false });
  f.authority.authorize.mockResolvedValue({
    allowed: true,
    scope: { tenantWide: false },
  } as any);
  expect(
    await f.authorizer.authorize({
      ...f.request("list", { ownerAccessCheck: true }),
      permissionCode: f.descriptor.ownerAccess!.administerPermission,
    }),
  ).toMatchObject({ allowed: false });
});

it("checks the admin capability with real IAM operation bindings", async () => {
  const { createPermissionAuthorizer } =
    await import("@athyper/server-platform-iam");
  const f = setup();
  const adminPermission = f.descriptor.ownerAccess!.administerPermission;
  let context = {
    ...f.context,
    permissions: {
      tenantId: self,
      principalId: self,
      planeKey: "neon",
      allowed: [f.descriptor.operations.list!.permissionCode, adminPermission],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
      operationBindings: [
        {
          entityCode: "principal",
          operationKey: "list",
          permissionCode: f.descriptor.operations.list!.permissionCode,
          decisionMode: "required",
          requiredScopeKinds: ["tenant"],
        },
      ],
    },
  } as unknown as VerifiedRequestContext;
  const authority = createPermissionAuthorizer();
  const request = {
    ...f.request("list", { ownerAccessCheck: true }),
    context,
    permissionCode: adminPermission,
  };
  expect(await authority.authorize(request)).toMatchObject({
    allowed: false,
    reason: "operation_permission_mismatch",
  });
  const authorizer = createPublishedTenantRecordAuthorizer({
    ...f.options,
    ownerAccess: true,
    authority,
    refreshContext: async () => context,
  });
  expect(await authorizer.authorize(request)).toMatchObject({ allowed: true });
  context = {
    ...context,
    permissions: {
      ...context.permissions,
      allowed: context.permissions.allowed.filter(
        (code) => code !== adminPermission,
      ),
    },
  };
  expect(await authorizer.authorize(request)).toMatchObject({ allowed: false });
});

it("applies self scope to actual SQL reads and counts independently of database RLS", async () => {
  const { Kysely, PostgresDialect } = await import("kysely");
  const {
    createRecordQueryService,
    createKyselyRecordRepository,
    createRecordOwnerAccessAdapter,
  } = await import("@athyper/server-service-records");
  const f = setup();
  const statements: { sql: string; params: unknown[] }[] = [];
  let admin = false;
  f.authority.authorize.mockImplementation(
    async (r) =>
      ({
        allowed:
          r.permissionCode !== f.descriptor.ownerAccess!.administerPermission ||
          admin,
      }) as any,
  );
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        connect: async () => ({
          release() {},
          query: async (sql: string, params: unknown[] = []) => {
            statements.push({ sql, params });
            return { rows: sql.includes("count(*)") ? [{ count: "0" }] : [] };
          },
        }),
      } as any,
    }),
  });
  const queries = createRecordQueryService({
    metadata: f.options.metadata,
    authorizer: f.authorizer,
    repository: createKyselyRecordRepository({ databases: { neon: db } }),
    transactions: {
      run: async (_plane, _context, work) => db.transaction().execute(work),
    },
    ownerAccess: createRecordOwnerAccessAdapter(f.authorizer),
  });
  try {
    await queries.list({
      context: f.context,
      entityCode: "principal",
      countMode: "exact",
      search: "another",
    });
    await queries.get({
      context: f.context,
      entityCode: "principal",
      recordId: self,
    });
    const reads = statements.filter((s) =>
      s.sql.includes('FROM "master"."principal"'),
    );
    expect(reads.length).toBeGreaterThanOrEqual(3);
    for (const read of reads) {
      expect(read.sql).toContain('"id" =');
      expect(read.params).toContain(self);
      expect(read.sql).toContain('"tenant_id" =');
    }
    expect(
      JSON.parse(
        String(statements.find((s) => s.sql.includes("set_config"))!.params[0]),
      ),
    ).toMatchObject({ admin: false });
    statements.length = 0;
    admin = true;
    await queries.list({
      context: f.context,
      entityCode: "principal",
      countMode: "exact",
    });
    expect(
      JSON.parse(
        String(statements.find((s) => s.sql.includes("set_config"))!.params[0]),
      ),
    ).toMatchObject({ admin: true });
    for (const read of statements.filter((s) =>
      s.sql.includes('FROM "master"."principal"'),
    )) {
      expect(read.sql).not.toContain('"id" =');
      expect(read.sql).toContain('"tenant_id" =');
    }
  } finally {
    await db.destroy();
  }
});

it("requires the published owner policy for high-risk administration and preserves IAM gates", async () => {
  const { createPublishedOwnerAdministrationAuthorizer } =
    await import("./published-owner-administration.js");
  const { createPermissionAuthorizer } =
    await import("@athyper/server-platform-iam");
  const f = setup();
  const permissionCode = f.descriptor.ownerAccess!.administerPermission;
  const requirement = {
    permissionCode,
    riskTier: "high",
    entitled: true,
    requiresMfa: false,
    requiresSod: false,
  };
  const context = {
    ...f.context,
    permissions: {
      ...f.context.permissions,
      tenantId: self,
      principalId: self,
      planeKey: "neon",
      allowed: [permissionCode],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
      requirements: [requirement],
    },
  } as unknown as VerifiedRequestContext;
  const resource = {
    tenantId: self,
    ownerEntityCode: "principal",
    ownerOperationKey: "list",
    authorizationDescriptorHash: f.descriptor.compiledHash,
  };
  const request = { context, permissionCode, resource };
  expect(await createPermissionAuthorizer().authorize(request)).toMatchObject({
    allowed: false,
    reason: "hard_policy_evidence_required",
  });
  const authority = createPublishedOwnerAdministrationAuthorizer(
    f.options.metadata,
  );
  expect(await authority.authorize(request)).toMatchObject({ allowed: true });
  for (const delta of [
    { tenantId: other },
    { ownerEntityCode: "other" },
    { ownerOperationKey: "delete" },
    { authorizationDescriptorHash: "stale" },
  ]) {
    expect(
      await authority.authorize({
        ...request,
        resource: { ...resource, ...delta },
      }),
    ).toMatchObject({ allowed: false });
  }
  for (const permissions of [
    { ...context.permissions, allowed: [] },
    { ...context.permissions, denied: [permissionCode] },
    { ...context.permissions, planLocked: [permissionCode] },
    {
      ...context.permissions,
      requirements: [{ ...requirement, requiresMfa: true }],
    },
    {
      ...context.permissions,
      requirements: [{ ...requirement, requiresSod: true }],
    },
  ])
    expect(
      await authority.authorize({
        ...request,
        context: { ...context, permissions } as VerifiedRequestContext,
      }),
    ).toMatchObject({ allowed: false });
});
