import { describe, expect, it, vi } from "vitest";
import type {
  EffectiveAuthorizationScope,
  EffectivePermissionContext,
  VerifiedRequestContext,
} from "@athyper/svc-iam";
import { createAtlasCompanyCodeDataGateway } from "../composition/atlas-record-data-gateway.js";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL_ID = "20000000-0000-4000-8000-000000000001";
const COMPANY_ID = "30000000-0000-4000-8000-000000000001";

function authorizationScope(
  overrides: Partial<EffectiveAuthorizationScope> = {},
): EffectiveAuthorizationScope {
  return {
    permissionCode: "read",
    tenantWide: false,
    legalEntityIds: new Set<string>(),
    companyCodeIds: new Set([COMPANY_ID]),
    operatingOrganizationIds: new Set<string>(),
    networkMembershipIds: new Set<string>(),
    visibility: "all",
    ...overrides,
  };
}

function context(
  overrides: Partial<VerifiedRequestContext> = {},
): VerifiedRequestContext {
  const planeKey = overrides.planeKey ?? "neon";
  const permissions: EffectivePermissionContext = {
    planeKey,
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    principalFingerprint: "principal-v1",
    allowed: new Set(["read"]),
    denied: new Set(),
    planLocked: new Set(),
    planeExcluded: new Set(),
    entries: new Map(),
    authorizationScopes: new Map([["read", authorizationScope()]]),
    profileHash: "profile-v1",
    schemaHash: "schema-v1",
    resolvedAt: Date.now(),
  };
  return {
    planeKey,
    realmKey: "athyper",
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    companyCodeId: COMPANY_ID,
    permissions,
    authEpoch: 7,
    profileHash: permissions.profileHash,
    requestId: "request-1",
    ...overrides,
  };
}

function target() {
  const descriptor = {
    identity: {
      plane: "neon",
      tenantId: TENANT_ID,
      entityCode: "company_code",
      compiledHash: "descriptor-v1",
    },
  };
  const descriptors = {
    get: vi.fn(async () => ({
      descriptor,
      serialized: {},
      generation: "generation-v1",
      cacheState: "L1",
    })),
  };
  const query = {
    detail: vi.fn(async () => ({
      data: {
        id: "CC-100",
        code: "MY",
        display_name: "Malaysia",
        masked_secret: "[REDACTED]",
      },
    })),
  };
  return {
    gateway: createAtlasCompanyCodeDataGateway({
      descriptors: descriptors as never,
      query: query as never,
    }),
    descriptors,
    query,
  };
}

describe("Atlas company-code data gateway", () => {
  it("loads an exact identifier through the canonical query service and returns immutable evidence", async () => {
    const { gateway, descriptors, query } = target();
    const verified = context();
    const result = await gateway.read(verified, {
      permissionCode: "read",
      entityCode: "company_code",
      sourceKind: "record",
      sourceId: "CC-100",
    });

    expect(descriptors.get).toHaveBeenCalledWith({
      plane: "neon",
      tenantId: TENANT_ID,
      entityCode: "company_code",
    }, new Map());
    expect(query.detail).toHaveBeenCalledWith(expect.objectContaining({
      context: verified,
      id: "CC-100",
      generation: "generation-v1",
      hydrateReferences: false,
    }));
    expect(result.value).toMatchObject({
      code: "MY",
      masked_secret: "[REDACTED]",
    });
    expect(result.source).toMatchObject({
      sourceKind: "record",
      sourceId: "CC-100",
      sourceVersionId: expect.stringMatching(/^sha256-[0-9a-f]{64}$/),
      sourceChecksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  it("denies the wrong plane, entity, and company scope before loading", async () => {
    for (const [verified, entityCode] of [
      [context({ planeKey: "admin" }), "company_code"],
      [context(), "purchase_invoice"],
      [context({ companyCodeId: "other-company" }), "company_code"],
    ] as const) {
      const { gateway, query } = target();
      await expect(gateway.read(verified, {
        permissionCode: "read",
        entityCode,
        sourceKind: "record",
        sourceId: "CC-100",
      })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
      expect(query.detail).not.toHaveBeenCalled();
    }
  });
});
