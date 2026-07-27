import { describe, expect, it, vi } from "vitest";
import type {
  EffectivePermissionContext,
  VerifiedRequestContext,
} from "@athyper/svc-iam";
import {
  AtlasDataGateway,
  AtlasDataGatewayError,
  type AtlasDataGatewayDependencies,
} from "../atlas-data-gateway.js";

const REQUEST = {
  permissionCode: "purchase_invoice.read",
  entityCode: "purchase_invoice",
  sourceKind: "record",
  sourceId: "invoice-1",
} as const;

function verifiedContext(
  overrides: Partial<VerifiedRequestContext> = {},
): VerifiedRequestContext {
  const permissions = {
    planeKey: "neon",
    tenantId: "tenant-1",
    principalId: "principal-1",
    principalFingerprint: "principal-fingerprint",
    allowed: new Set([REQUEST.permissionCode]),
    denied: new Set<string>(),
    planLocked: new Set<string>(),
    planeExcluded: new Set<string>(),
    entries: new Map(),
    authorizationScopes: new Map(),
    profileHash: "profile-hash",
    schemaHash: "schema-hash",
    resolvedAt: Date.now(),
  } satisfies EffectivePermissionContext;
  return {
    planeKey: "neon",
    realmKey: "athyper",
    tenantId: "tenant-1",
    principalId: "principal-1",
    permissions,
    authEpoch: 3,
    profileHash: permissions.profileHash,
    requestId: "request-1",
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<AtlasDataGatewayDependencies> = {},
): AtlasDataGatewayDependencies {
  return {
    authorize: vi.fn(async () => ({ allowed: true })),
    load: vi.fn(async () => ({
      value: { secret: "remove", amount: 42 },
      source: {
        sourceKind: "record",
        sourceId: "invoice-1",
        sourceVersionId: "invoice-1-v7",
      },
    })),
    mask: vi.fn(async () => ({ ok: true, value: { amount: 42 } })),
    ...overrides,
  };
}

describe("AtlasDataGateway", () => {
  it("returns only the masked value and immutable source revision", async () => {
    const deps = dependencies();
    const result = await new AtlasDataGateway(deps).read(
      verifiedContext(),
      REQUEST,
    );

    expect(result).toEqual({
      value: { amount: 42 },
      source: {
        sourceKind: "record",
        sourceId: "invoice-1",
        sourceVersionId: "invoice-1-v7",
      },
      authorizationProfileHash: "profile-hash",
    });
    expect(deps.authorize).toHaveBeenCalledBefore(
      vi.mocked(deps.load),
    );
    expect(deps.load).toHaveBeenCalledBefore(
      vi.mocked(deps.mask),
    );
  });

  it("rejects an internally inconsistent verified context before authorization", async () => {
    const deps = dependencies();
    const context = verifiedContext({ tenantId: "tenant-2" });

    await expect(
      new AtlasDataGateway(deps).read(context, REQUEST),
    ).rejects.toMatchObject<Partial<AtlasDataGatewayError>>({
      code: "INVALID_VERIFIED_CONTEXT",
    });
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it("denies a missing permission before loading source data", async () => {
    const deps = dependencies();
    const base = verifiedContext();
    const context = verifiedContext({
      permissions: {
        ...base.permissions,
        allowed: new Set<string>(),
      },
    });

    await expect(
      new AtlasDataGateway(deps).read(context, REQUEST),
    ).rejects.toMatchObject<Partial<AtlasDataGatewayError>>({
      code: "PERMISSION_DENIED",
    });
    expect(deps.load).not.toHaveBeenCalled();
  });

  it.each([
    ["plan-locked", "planLocked"],
    ["plane-excluded", "planeExcluded"],
  ] as const)(
    "denies a %s permission before authorization or source loading",
    async (_label, permissionSet) => {
      const deps = dependencies();
      const base = verifiedContext();
      const context = verifiedContext({
        permissions: {
          ...base.permissions,
          allowed: new Set([REQUEST.permissionCode]),
          [permissionSet]: new Set([REQUEST.permissionCode]),
        },
      });

      await expect(
        new AtlasDataGateway(deps).read(context, REQUEST),
      ).rejects.toMatchObject<Partial<AtlasDataGatewayError>>({
        code: "PERMISSION_DENIED",
      });
      expect(deps.authorize).not.toHaveBeenCalled();
      expect(deps.load).not.toHaveBeenCalled();
      expect(deps.mask).not.toHaveBeenCalled();
    },
  );

  it("fails closed when field masking cannot produce a safe value", async () => {
    const deps = dependencies({
      mask: vi.fn(async () => ({
        ok: false,
        code: "field_policy_unavailable",
      })),
    });

    await expect(
      new AtlasDataGateway(deps).read(verifiedContext(), REQUEST),
    ).rejects.toMatchObject<Partial<AtlasDataGatewayError>>({
      code: "FIELD_MASKING_DENIED",
      detailCode: "field_policy_unavailable",
    });
  });

  it("rechecks authorization before loading a source for each company/lifecycle scope", async () => {
    const authorize = vi.fn(async () => ({ allowed: false as const, code: "company_scope_denied" }));
    const deps = dependencies({ authorize });
    await expect(new AtlasDataGateway(deps).read(verifiedContext(), REQUEST))
      .rejects.toMatchObject<Partial<AtlasDataGatewayError>>({ code: "SCOPE_DENIED", detailCode: "company_scope_denied" });
    expect(authorize).toHaveBeenCalledOnce();
    expect(deps.load).not.toHaveBeenCalled();
  });

  it("rejects stale or substituted immutable revisions", async () => {
    const deps = dependencies({
      load: vi.fn(async () => ({ value: {}, source: { sourceKind: "record" as const, sourceId: REQUEST.sourceId, sourceVersionId: "" } })),
    });
    await expect(new AtlasDataGateway(deps).read(verifiedContext(), REQUEST))
      .rejects.toMatchObject<Partial<AtlasDataGatewayError>>({ code: "SOURCE_METADATA_REQUIRED" });
  });

  it("rejects source metadata that does not match the authorized request", async () => {
    const deps = dependencies({
      load: vi.fn(async () => ({
        value: {},
        source: {
          sourceKind: "record",
          sourceId: "invoice-from-another-request",
          sourceVersionId: "version-1",
        },
      })),
    });

    await expect(
      new AtlasDataGateway(deps).read(verifiedContext(), REQUEST),
    ).rejects.toMatchObject<Partial<AtlasDataGatewayError>>({
      code: "SOURCE_METADATA_REQUIRED",
    });
  });
});
