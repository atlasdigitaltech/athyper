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

it("correlates concurrent source constraints and final decisions without emitting resource values", async () => {
  const s = setup(),
    events: Array<Record<string, unknown>> = [];
  const backend = createEntityBackendAuthorizer({
    ...s.options,
    isolatedExecution: {
      ...s.options.isolatedExecution!,
      diagnostic: (e) => events.push(e),
    },
  });
  const results = await Promise.all(
    [1, 2].map(() =>
      backend.authorize({
        context,
        permissionCode: "legacy.read",
        resource: { privateValue: "never-log" },
      }),
    ),
  );
  expect(results).toEqual([{ allowed: true }, { allowed: true }]);
  const refs = [...new Set(events.map((e) => e.evaluationRef))];
  expect(refs).toHaveLength(2);
  for (const ref of refs) {
    const trace = events.filter((e) => e.evaluationRef === ref);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "source_authority", state: "denied" }),
        expect.objectContaining({
          stage: "source_constraints",
          state: "satisfied",
        }),
        expect.objectContaining({
          stage: "backend_complete",
          state: "allowed",
        }),
      ]),
    );
    expect(trace.filter((e) => e.stage === "backend_complete")).toHaveLength(1);
  }
  expect(JSON.stringify(events)).not.toContain("never-log");
});
it("records a final field denial even when record authorization passed", async () => {
  const s = setup(),
    events: Array<Record<string, unknown>> = [];
  const backend = createEntityBackendAuthorizer({
    ...s.options,
    target: () => ({
      operationKey: "read",
      recordId: "record",
      phase: "execute",
      fieldUses: [{ field: "secret", use: "read" }],
    }),
    isolatedExecution: {
      ...s.options.isolatedExecution!,
      diagnostic: (e) => events.push(e),
    },
  });
  expect(
    await backend.authorize({ context, permissionCode: "legacy.read" }),
  ).toMatchObject({ allowed: false, reason: "entity_field_use_denied" });
  expect(events.at(-1)).toMatchObject({
    stage: "backend_complete",
    state: "denied",
  });
});
it("does not let diagnostic sink failures change authorization", async () => {
  const s = setup();
  const backend = createEntityBackendAuthorizer({
    ...s.options,
    isolatedExecution: {
      ...s.options.isolatedExecution!,
      diagnostic: () => {
        throw Error("Telemetry unavailable");
      },
    },
  });
  expect(
    await backend.authorize({ context, permissionCode: "legacy.read" }),
  ).toEqual({ allowed: true });
});
it("retains an explicit source-constraint denial in correlated evidence", async () => {
  const s = setup("denied"),
    events: Array<Record<string, unknown>> = [];
  const backend = createEntityBackendAuthorizer({
    ...s.options,
    isolatedExecution: {
      ...s.options.isolatedExecution!,
      diagnostic: (e) => events.push(e),
    },
  });
  expect(
    await backend.authorize({ context, permissionCode: "legacy.read" }),
  ).toMatchObject({ allowed: false });
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ stage: "source_constraints", state: "denied" }),
      expect.objectContaining({ stage: "backend_complete", state: "denied" }),
    ]),
  );
});
