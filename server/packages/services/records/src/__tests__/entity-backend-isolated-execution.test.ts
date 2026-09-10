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
// Dedicated-host gate is deliberately separate from production qualification.
it("requires the trusted isolated gate on each boundary, preserving domain denial and revocation", async () => {
  let current = true;
  const assertCurrent = vi.fn(async () => { if (!current) throw new Error("ISOLATED_RELEASE_CHANGED"); });
  const s = setup({verifyQualification: async () => null, isolatedExecution: {assertCurrent}});
  expect((await s.wrapped.authorize(request)).allowed).toBe(true);
  expect(assertCurrent).toHaveBeenCalledWith(s.options.rollout.release);
  current = false;
  expect((await s.wrapped.authorize(request)).allowed).toBe(false);
  current = true;
  s.refreshContext.mockResolvedValue({...context, permissions: {...context.permissions, operationBindings: []}});
  expect((await s.wrapped.authorize(request)).allowed).toBe(false);
  const denied = setup({verifyQualification: async () => null, isolatedExecution: {assertCurrent}, authority: {authorize: async () => ({allowed: false, reason: "revoked"})}});
  expect((await denied.wrapped.authorize(request)).allowed).toBe(false);
});
it("request data cannot opt a normal host into isolated execution", async () => {
  const s = setup({verifyQualification: async () => null});
  expect((await s.wrapped.authorize({...request,resource: {...request.resource, isolatedExecution: true}})).allowed).toBe(false);
});

it("accepts the native resource binding only for the matching reviewed target", async () => {
  for (const [decisionMode, allowed] of [["entity_resource",true],["collection",false],["unknown",false]] as const) {
    const refreshed={...context,permissions:{...context.permissions,operationBindings:context.permissions.operationBindings!.map(b=>({...b,decisionMode}))}};
    const s=setup({refreshContext:async()=>refreshed,verifyQualification:async()=>null,isolatedExecution:{assertCurrent:async()=>{}}});
    expect((await s.wrapped.authorize(request)).allowed).toBe(allowed);
  }
});
