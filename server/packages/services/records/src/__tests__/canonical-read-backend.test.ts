import { expect, it, vi } from "vitest";
import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
} from "@athyper/server-contract-metadata";
import type {
  VerifiedRequestContext,
  AuthorizationRequest,
} from "@athyper/server-contract-auth";
import {
  createEntityBackendAuthorizer,
  type EntityBackendAuthorizerOptions,
} from "../entity-backend-authorizer.js";
import { entityAuthorizationProfileHash as hash } from "../entity-authorization-rollout.js";
const profile = parseEntityAuthorizationProfile({
  schemaVersion: 1,
  entityCode: "entity",
  planeKey: "neon",
  ownership: "tenant.record.v1",
  directory: { operation: "discover", population: "tenant" },
  recordReadOperation: "read",
  operations: [
    {
      key: "discover",
      permissionCode: "target.discover",
      scope: "tenant.record.v1",
      target: "collection",
      effect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
    },
    {
      key: "read",
      permissionCode: "target.read",
      scope: "tenant.record.v1",
      target: "existing",
      effect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
    },
  ],
  fieldPolicies: [],
  surfaces: [],
  relationships: [],
});
const plan = {
  schemaVersion: 1,
  kind: "entity_canonical_read_admission",
  entityCode: "entity",
  planeKey: "neon",
  profileHash: hash(profile),
  reviewRevision: "b".repeat(64),
  transitions: [
    {
      operationKey: "read",
      sourcePermissionCode: "legacy.read",
      targetPermissionCode: "target.read",
    },
  ],
};
const runtime = parseEntityAuthorizationRuntime(
  {
    schemaVersion: 2,
    runtimeVersion: "entity-authorization.v2",
    bindings: profile.operations.map((o) => ({
      operation: o.key,
      handler: "entity.read.v1",
      resolver: o.scope,
    })),
    canonicalReadAdmission: plan,
  },
  profile,
);
const context = {
  tenantId: "tenant",
  principalId: "principal",
  planeKey: "neon",
  realmKey: "realm",
  authEpoch: 1,
  permissions: {
    tenantId: "tenant",
    principalId: "principal",
    planeKey: "neon",
    operationBindings: profile.operations.map((o) => ({
      entityCode: "entity",
      operationKey: o.key,
      permissionCode: o.permissionCode,
      decisionMode: "authorize",
      requiredScopeKinds: [],
    })),
  },
} as VerifiedRequestContext;
function setup(
  constraint: "satisfied" | "denied" | "unavailable" = "satisfied",
  targetAllowed = true,
) {
  const release = {
    entityCode: "entity",
    planeKey: "neon" as const,
    descriptorHash: "a".repeat(64),
    profileHash: hash(profile),
    bindingsHash: hash(runtime),
    runtimeVersion: runtime.runtimeVersion,
  };
  const check = vi.fn(async (_request: AuthorizationRequest) =>
    constraint === "satisfied"
      ? { state: constraint }
      : { state: constraint, reason: "test_denial" },
  );
  const authority = {
    authorize: vi.fn(async (r: AuthorizationRequest) => ({
      allowed: r.permissionCode === "target.read" && targetAllowed,
      reason: "source_missing",
    })),
    checkSourceConstraints: check,
  };
  const options: EntityBackendAuthorizerOptions = {
    authority,
    profile,
    runtime,
    permissionTransitions: plan.transitions,
    rollout: {
      schemaVersion: 1,
      mode: "enforce",
      release,
      qualificationRef: "unit-test",
    },
    owns: () => true,
    target: () => ({
      operationKey: "read",
      recordId: "record",
      phase: "execute",
    }),
    refreshContext: async () => context,
    scopes: {
      resolve: async () => ({ state: "resolved", coordinates: {} }),
      preflight: async () => "allowed",
    },
    currentRelease: async () => release,
    verifyQualification: async () => null,
    currentRevocationWatermark: async () => "current",
    writeShadow: async () => {},
    diagnostic: () => {},
    isolatedExecution: { assertCurrent: async () => {} },
  };
  return { options, check };
}
it("requires target allow and source constraints, but no second source allow", async () => {
  for (const permissionCode of ["legacy.read", "target.read"]) {
    const s = setup();
    expect(
      await createEntityBackendAuthorizer(s.options).authorize({
        context,
        permissionCode,
        resource: {
          businessPartnerId: "record",
          operatingOrganizationId: "untrusted",
        },
      }),
    ).toEqual({ allowed: true });
    expect(s.check).toHaveBeenCalled();
    expect(s.check.mock.calls[0]?.[0]).toMatchObject({
      permissionCode: "legacy.read",
      resource: {
        operationKey: "read",
        recordId: "record",
        tenantId: "tenant",
      },
    });
    expect(
      s.check.mock.calls[0]?.[0].resource?.["operatingOrganizationId"],
    ).toBeUndefined();
  }
  for (const [state, targetAllowed] of [
    ["denied", true],
    ["unavailable", true],
    ["satisfied", false],
  ] as const) {
    const s = setup(state, targetAllowed);
    expect(
      await createEntityBackendAuthorizer(s.options).authorize({
        context,
        permissionCode: "legacy.read",
      }),
    ).toMatchObject({ allowed: false });
  }
});
it("cannot apply a plan to old bindings or an authority without constraint verification", () => {
  const s = setup();
  expect(() =>
    createEntityBackendAuthorizer({
      ...s.options,
      rollout: {
        ...s.options.rollout,
        release: {
          ...s.options.rollout.release,
          runtimeVersion: "entity-authorization.v1",
        },
      },
    }),
  ).toThrow("ENTITY_BACKEND_RUNTIME_MISMATCH");
  expect(() =>
    createEntityBackendAuthorizer({
      ...s.options,
      authority: { authorize: s.options.authority.authorize },
    }),
  ).toThrow("ENTITY_SOURCE_CONSTRAINT_VERIFIER_MISSING");
  expect(() =>
    createEntityBackendAuthorizer({ ...s.options, permissionTransitions: [] }),
  ).toThrow("ENTITY_CANONICAL_TRANSITION_MISMATCH");
});
