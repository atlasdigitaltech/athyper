import { readFileSync } from "node:fs";
import { it, expect, vi } from "vitest";
import type {
  AuthorizationRequest,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  parseEntityAuthorizationProfile,
  entityScopeResolvers,
} from "@athyper/server-contract-metadata";
import {
  createEntityBackendAuthorizer,
  type EntityBackendAuthorizerOptions,
} from "../entity-backend-authorizer.js";
import {
  entityAuthorizationCoverage,
  entityAuthorizationProfileHash,
} from "../entity-authorization-rollout.js";
const profile = parseEntityAuthorizationProfile(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
const context: VerifiedRequestContext = {
  tenantId: "tenant",
  principalId: "principal",
  planeKey: "neon",
  realmKey: "realm",
  authEpoch: 1,
  profileHash: "profile",
  requestId: "request",
  permissions: {
    tenantId: "tenant",
    principalId: "principal",
    planeKey: "neon",
    profileHash: "profile",
    schemaHash: "schema",
    principalFingerprint: "principal",
    resolvedAt: 1,
    allowed: [],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
    operationBindings: profile.operations.map((o) => ({
      entityCode: profile.entityCode,
      operationKey: o.key,
      permissionCode: o.permissionCode,
      decisionMode: "authorize",
      requiredScopeKinds: entityScopeResolvers[o.scope].map(
        (key) =>
          ({
            operatingOrganizationId: "operating_organization",
            companyCodeId: "company_code",
            workspaceId: "workspace",
            networkRelationshipId: "network_relationship",
          })[key],
      ),
    })),
  },
};
const request: AuthorizationRequest = {
  context,
  permissionCode: "neon.relationship.business_partner.read",
  resource: {
    entityCode: "business_partner",
    operationKey: "read",
    recordId: "bp",
  },
};
function setup(overrides: Partial<EntityBackendAuthorizerOptions> = {}) {
  const release = {
    planeKey: "neon" as const,
    entityCode: "business_partner",
    descriptorHash: "a".repeat(64),
    profileHash: entityAuthorizationProfileHash(profile),
    bindingsHash: "b".repeat(64),
    runtimeVersion: "backend.v1",
  };
  const authority = {
    authorize: vi.fn(async (_request: AuthorizationRequest) => ({
      allowed: true as const,
    })),
  };
  const refreshContext = vi.fn(async () => structuredClone(context)),
    preflight = vi.fn(async () => "allowed" as const);
  const options: EntityBackendAuthorizerOptions = {
    authority,
    profile,
    rollout: {
      schemaVersion: 1,
      mode: "enforce",
      release,
      qualificationRef: "review",
    },
    owns: (r) =>
      r.permissionCode.startsWith("neon.relationship.business_partner"),
    target: (r) => ({
      operationKey: String(r.resource?.["operationKey"] ?? "read"),
      recordId: "bp",
      phase: "execute",
    }),
    refreshContext,
    scopes: {
      resolve: async (input) => ({
        state: "resolved",
        coordinates: input.coordinates ?? {},
      }),
      preflight,
    },
    currentRelease: async () => release,
    verifyQualification: async () => ({
      release,
      coverage: entityAuthorizationCoverage,
      unresolvedDifferences: 0,
      grantReviewRef: "review",
      rollbackRef: "rollback",
      revocationWatermark: "current",
      companyEntityQualified: true,
      independentChildQualified: true,
    }),
    currentRevocationWatermark: async () => "current",
    writeShadow: async () => {},
    diagnostic: () => {},
    ...overrides,
  };
  return {
    options,
    authority,
    refreshContext,
    preflight,
    wrapped: createEntityBackendAuthorizer(options),
  };
}
it("requires compatible reviewed activation before target evaluation", async () => {
  const s = setup({ verifyQualification: async () => null });
  expect(await s.wrapped.authorize(request)).toEqual({
    allowed: false,
    reason: "entity_authorization_unavailable",
  });
  expect(s.preflight).not.toHaveBeenCalled();
});
it("legacy and shadow are exact pass-through and never refresh or preflight", async () => {
  for (const mode of ["legacy", "shadow"] as const) {
    const s = setup();
    const wrapped = createEntityBackendAuthorizer({
      ...s.options,
      rollout: { ...s.options.rollout, mode },
    });
    expect(wrapped).toBe(s.authority);
    expect((await wrapped.authorize(request)).allowed).toBe(true);
    expect(s.authority.authorize).toHaveBeenCalledTimes(1);
    expect(s.refreshContext).not.toHaveBeenCalled();
    expect(s.preflight).not.toHaveBeenCalled();
  }
});
it("refreshes each boundary and rejects revocation after page admission", async () => {
  const s = setup();
  expect((await s.wrapped.authorize(request)).allowed).toBe(true);
  s.refreshContext.mockResolvedValue({
    ...context,
    permissions: { ...context.permissions, operationBindings: [] },
  });
  expect((await s.wrapped.authorize(request)).allowed).toBe(false);
  expect(s.refreshContext).toHaveBeenCalledTimes(2);
});
it("never substitutes another principal or tenant during refresh", async () => {
  const s = setup({
    refreshContext: async () => ({ ...context, tenantId: "other" }),
  });
  expect((await s.wrapped.authorize(request)).allowed).toBe(false);
  expect(s.authority.authorize).not.toHaveBeenCalled();
});
it("unknown operations fail closed with no retry-compatible denial", async () => {
  const s = setup({ target: () => null });
  expect(await s.wrapped.authorize(request)).toEqual({
    allowed: false,
    reason: "entity_authorization_unmapped",
  });
});
it("does not use advisory observations to repair an unmapped request", async () => {
  const s = setup({ target: () => null });
  expect(
    (
      await s.wrapped.authorize({
        ...request,
        observation: {
          entityCode: "business_partner",
          operationKey: "read",
          recordId: "bp",
        },
      })
    ).allowed,
  ).toBe(false);
});
it("retains legacy/domain denial when target would allow", async () => {
  const s = setup({
    authority: {
      authorize: async (r) =>
        r.resource?.["resourceCode"]
          ? { allowed: true }
          : { allowed: false, reason: "domain_denied" },
    },
  });
  expect((await s.wrapped.authorize(request)).allowed).toBe(false);
});
it("cannot use a different permission through an operation mapping", async () => {
  const s = setup({
    target: () => ({
      operationKey: "identity_read",
      recordId: "bp",
      phase: "execute",
    }),
  });
  expect(await s.wrapped.authorize(request)).toEqual({
    allowed: false,
    reason: "entity_authorization_binding_mismatch",
  });
});
it("rejects unknown write fields before any caller can mutate", async () => {
  const s = setup({
    target: () => ({
      operationKey: "update",
      recordId: "bp",
      phase: "execute",
      writeFields: ["bankAccounts"],
    }),
  });
  expect(
    await s.wrapped.authorize({
      ...request,
      permissionCode: "neon.relationship.business_partner.update",
      resource: { operationKey: "update" },
    }),
  ).toEqual({ allowed: false, reason: "entity_field_write_denied" });
});
it("rejects unauthorized query/export fields, including hidden search inputs", async () => {
  for (const use of ["filter", "sort", "search", "export", "read"] as const) {
    const s = setup({
      target: () => ({
        operationKey: "read",
        recordId: "bp",
        phase: "execute",
        fieldUses: [{ field: "secret", use }],
      }),
    });
    expect(await s.wrapped.authorize(request)).toEqual({
      allowed: false,
      reason: "entity_field_use_denied",
    });
  }
});
it("does not import shell organization into global record ownership", async () => {
  const s = setup();
  await s.wrapped.authorize({
    ...request,
    resource: {
      ...request.resource,
      operatingOrganizationId: "shell",
      makerCheckerEnforced: true,
    },
  });
  const calls = s.authority.authorize.mock.calls.map(([r]) => r);
  expect(
    calls.find((r) => r.resource?.["resourceCode"] === "business_partner")
      ?.resource,
  ).toMatchObject({ makerCheckerEnforced: true });
  expect(
    calls.find((r) => r.resource?.["resourceCode"] === "business_partner")
      ?.resource,
  ).not.toHaveProperty("operatingOrganizationId");
});
it("permits unrelated entities without evaluating BP or refreshing their context", async () => {
  const s = setup();
  expect(
    (
      await s.wrapped.authorize({
        ...request,
        permissionCode: "finance.invoice.read",
      })
    ).allowed,
  ).toBe(true);
  expect(s.refreshContext).not.toHaveBeenCalled();
});
it("resolver and authority-refresh outages close the target path", async () => {
  const s = setup({
    refreshContext: async () => {
      throw new Error("private detail");
    },
  });
  expect(await s.wrapped.authorize(request)).toEqual({
    allowed: false,
    reason: "entity_authorization_unavailable",
  });
});

it("direct Records get is denied before repository access", async () => {
  const { createRecordQueryService } = await import("../query-service.js");
  const s = setup({ verifyQualification: async () => null }),
    get = vi.fn(),
    list = vi.fn();
  const service = createRecordQueryService({
    authorizer: s.wrapped,
    metadata: {
      getEntityDescriptor: async () => ({
        schema: "athyper.entity-runtime-descriptor/1.0",
        entityCode: "business_partner",
        planeKey: "neon",
        releaseId: "release",
        releaseNo: 1,
        contractHash: "a".repeat(64),
        compiledHash: "b".repeat(64),
        storage: {
          schema: "master",
          object: "business_partner",
          idField: "id",
        },
        fields: [],
        operations: {
          read: { code: "read", permissionCode: request.permissionCode },
        },
        authorization: profile,
      }),
    },
    repository: { get, list } as never,
    transactions: { run: async (_plane, _actor, work) => work({}) },
  });
  await expect(
    service.get({ context, entityCode: "business_partner", recordId: "bp" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(get).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
});

it("profiled export download rechecks fields and authority before minting an artifact URL", async () => {
  const { createRecordTransferService } =
    await import("../transfer/transfer-service.js");
  const { createInMemoryRecordTransferStore } =
    await import("../transfer/in-memory-transfer-store.js");
  const { GovernedImportAdapterRegistry } =
    await import("../transfer/import-adapter-registry.js");
  const s = setup({
    target: () => ({
      operationKey: "export",
      phase: "execute",
      fieldUses: [{ field: "code", use: "export" }],
    }),
  });
  const storage = createInMemoryRecordTransferStore<object>();
  storage.getExport = async () => ({
    entityCode: "business_partner",
    actorPrincipalId: context.principalId,
    status: "completed",
    exactFilter: { fields: ["code"] },
    artifactKey: "private-object",
  });
  const createDownloadUrl = vi.fn(async () => "https://download.test/artifact");
  const service = createRecordTransferService({
    staging: storage,
    authorizer: s.wrapped,
    metadata: {
      getEntityDescriptor: async () => ({
        schema: "athyper.entity-runtime-descriptor/1.0",
        entityCode: "business_partner",
        planeKey: "neon",
        releaseId: "release",
        releaseNo: 1,
        contractHash: "a".repeat(64),
        compiledHash: "b".repeat(64),
        storage: {
          schema: "master",
          object: "business_partner",
          idField: "id",
        },
        fields: [],
        operations: {
          export: { code: "export", permissionCode: request.permissionCode },
        },
        authorization: profile,
      }),
    },
    validator: {
      validate: async (_c, _e, _r, rowNumber) => ({
        rowNumber,
        valid: true,
        errors: [],
      }),
    },
    jobs: { enqueue: async () => "job" },
    adapters: new GovernedImportAdapterRegistry([]),
    transactions: { run: async (_plane, _actor, work) => work({}) },
    audit: {
      record: async (input) => ({
        ...input,
        id: "audit",
        occurredAt: new Date().toISOString(),
        severity: "info",
      }),
    },
    outbox: { append: async () => {} },
    errorReports: { write: async () => "", createDownloadUrl },
  });
  await expect(
    service.downloadExport(context, "export"),
  ).resolves.toHaveProperty("url");
  s.refreshContext.mockResolvedValue({
    ...context,
    permissions: { ...context.permissions, operationBindings: [] },
  });
  await expect(service.downloadExport(context, "export")).rejects.toMatchObject(
    { code: "FORBIDDEN" },
  );
  expect(createDownloadUrl).toHaveBeenCalledTimes(1);
});

it("publishing a profile alone does not select enforcement", async () => {
  const { usesEntityBackendAuthorization } =
    await import("../entity-backend-authorizer.js");
  const s = setup(),
    descriptor = {
      entityCode: "business_partner",
      authorization: profile,
    } as import("@athyper/server-contract-metadata").EntityRuntimeDescriptor;
  expect(usesEntityBackendAuthorization(s.authority, context, descriptor)).toBe(
    false,
  );
  expect(usesEntityBackendAuthorization(s.wrapped, context, descriptor)).toBe(
    true,
  );
  expect(() =>
    usesEntityBackendAuthorization(s.wrapped, context, {
      ...descriptor,
      authorization: undefined,
    }),
  ).toThrow("PROFILE_MISMATCH");
});

it("profiled collection reads reject a denied row and do not expose aggregate counts", async () => {
  const { createRecordQueryService } = await import("../query-service.js");
  const s = setup({
    authority: {
      authorize: async (r) =>
        r.resource?.["recordId"] === "hidden"
          ? { allowed: false, reason: "denied_by_grant" }
          : { allowed: true },
    },
    target: (r) => ({
      operationKey: r.resource?.["recordId"] ? "read" : "discover",
      ...(r.resource?.["recordId"]
        ? { recordId: String(r.resource["recordId"]) }
        : {}),
      phase: "execute",
    }),
  });
  const list = vi.fn(async () => ({
    data: [{ id: "hidden" }],
    pagination: { pageSize: 1, hasMore: false, countMode: "none" as const },
  }));
  const descriptor: import("@athyper/server-contract-metadata").EntityRuntimeDescriptor =
    {
      schema: "athyper.entity-runtime-descriptor/1.0",
      entityCode: "business_partner",
      planeKey: "neon",
      releaseId: "release",
      releaseNo: 1,
      contractHash: "a".repeat(64),
      compiledHash: "b".repeat(64),
      storage: { schema: "master", object: "business_partner", idField: "id" },
      fields: [
        {
          key: "id",
          storagePath: "id",
          type: "string",
          required: true,
          writableOn: [],
        },
      ],
      operations: {
        read: { code: "read", permissionCode: request.permissionCode },
      },
      authorization: profile,
    };
  const service = createRecordQueryService({
    authorizer: s.wrapped,
    metadata: { getEntityDescriptor: async () => descriptor },
    repository: { list } as never,
    transactions: { run: async (_plane, _actor, work) => work({}) },
  });
  await expect(
    service.list({ context, entityCode: "business_partner" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  list.mockClear();
  await expect(
    service.list({
      context,
      entityCode: "business_partner",
      countMode: "exact",
    }),
  ).rejects.toMatchObject({
    code: "ENTITY_AGGREGATE_IDENTITY_INVALID",
  });
  expect(list).toHaveBeenCalledOnce();
});

it("never falls back to a legacy allow for an explicitly deferred target operation", async () => {
  const s = setup();
  const deferred = { ...profile, deferredOperations: ["deferred_action"] };
  const wrapped = createEntityBackendAuthorizer({
    ...s.options, profile: deferred,
    rollout: { ...s.options.rollout, release: { ...s.options.rollout.release, profileHash: entityAuthorizationProfileHash(deferred) } },
  });
  expect(await wrapped.authorize({ ...request, resource: { ...request.resource, operationKey: "deferred_action" } })).toEqual({ allowed: false, reason: "entity_authorization_unavailable" });
  expect(s.preflight).not.toHaveBeenCalled();
});

it("requires both source and target authority for an explicit permission transition", async () => {
  const sourcePermissionCode = "neon.relationship.business_partner.legacy_read";
  const targetPermissionCode = request.permissionCode;
  for (const sourceAllowed of [false, true]) for (const targetAllowed of [false, true]) {
    const authorize = vi.fn(async (input: AuthorizationRequest) => ({
      allowed: input.permissionCode === sourcePermissionCode ? sourceAllowed : targetAllowed,
      reason: "test_decision",
    }));
    const s = setup({authority: {authorize}, permissionTransitions: [{
      operationKey: "read", sourcePermissionCode, targetPermissionCode,
    }]});
    const result = await s.wrapped.authorize({...request, permissionCode: sourcePermissionCode});
    expect(result.allowed).toBe(sourceAllowed && targetAllowed);
    expect(authorize.mock.calls.some(([input]) => input.permissionCode === targetPermissionCode)).toBe(true);
  }
});
it("rejects unregistered, mismatched and duplicate capability transitions", async () => {
  const sourcePermissionCode = "neon.relationship.business_partner.legacy_read";
  const transition = {operationKey: "read", sourcePermissionCode, targetPermissionCode: request.permissionCode};
  expect(await setup().wrapped.authorize({...request, permissionCode: sourcePermissionCode,
    resource: {...request.resource, permissionTransitions: [transition]}})).toMatchObject({
    allowed: false, reason: "entity_authorization_binding_mismatch",
  });
  expect(() => setup({permissionTransitions: [{...transition, targetPermissionCode: "other"}]})).toThrow("ENTITY_BACKEND_TRANSITION_MISMATCH");
  expect(() => setup({permissionTransitions: [transition, transition]})).toThrow("ENTITY_BACKEND_TRANSITION_MISMATCH");
});

it("authorizes collection export fields through directory independently of export authority", async () => {
  const exportOperation = profile.operations.find(o => o.key === "export")!;
  const field = profile.fieldPolicies.find(p => p.readOperation === profile.recordReadOperation && p.queryUses.includes("export") && p.representation === "plain")!.fields[0]!;
  const seen: string[] = [];
  let directoryAllowed = true;
  const s = setup({
    authority: {authorize: async input => { const key = String(input.resource?.operationKey); seen.push(key); return {allowed: key !== profile.directory.operation || directoryAllowed}; }},
    target: () => ({operationKey:"export",phase:"execute",fieldUses:[{field,use:"export"}]}),
  });
  const input = {...request,permissionCode:exportOperation.permissionCode};
  expect((await s.wrapped.authorize(input)).allowed).toBe(true);
  expect(seen).toContain(profile.directory.operation);
  directoryAllowed = false;
  expect(await s.wrapped.authorize(input)).toMatchObject({allowed:false,reason:"entity_field_use_denied"});
});
