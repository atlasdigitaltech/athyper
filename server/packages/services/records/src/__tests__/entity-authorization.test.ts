import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseEntityAccessDecision } from "@athyper/contract-platform-entity-runtime";
import {
  entityScopeResolvers,
  parseEntityAuthorizationProfile,
} from "@athyper/server-contract-metadata";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  createEntityAccessEvaluator,
  projectEntityFields,
  assertEntityFieldWrite,
  assertEntityFieldQuery,
  authorizeEntityRelationship,
  type EntityScopeCoordinates,
  type EntityScopeAdapter,
  type EntityAccessInput,
} from "../entity-authorization.js";
import {
  createEntityAuthorizationRolloutEvaluator,
  entityAuthorizationCoverage,
  parseEntityAuthorizationRollout,
  type EntityAuthorizationRelease,
  type EntityAuthorizationQualification,
} from "../entity-authorization-rollout.js";

const fixture = (name: string) =>
  parseEntityAuthorizationProfile(
    JSON.parse(
      readFileSync(
        new URL(
          `../../../../../../packages/contracts/platform/fixtures/entity-authorization/${name}.v1.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
const operationBindings = [
  "business-partner",
  "company-invoice",
  "independent-document",
].flatMap((name) => {
  const profile = fixture(name);
  return profile.operations.map((o) => ({
    entityCode: profile.entityCode,
    operationKey: o.key,
    permissionCode: o.permissionCode,
    decisionMode: "authorize",
    requiredScopeKinds: entityScopeResolvers[o.scope].map(
      (key) =>
        ({
          companyCodeId: "company_code",
          operatingOrganizationId: "operating_organization",
          workspaceId: "workspace",
          networkRelationshipId: "network_relationship",
        })[key],
    ),
  }));
});
const context: VerifiedRequestContext = {
  tenantId: "tenant",
  principalId: "principal",
  planeKey: "neon",
  realmKey: "athyper",
  authEpoch: 1,
  profileHash: "profile",
  requestId: "request",
  permissions: {
    operationBindings,
    planeKey: "neon",
    tenantId: "tenant",
    principalId: "principal",
    principalFingerprint: "principal",
    profileHash: "profile",
    schemaHash: "schema",
    resolvedAt: 1,
    allowed: [],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
  },
};
const request: EntityAccessInput = {
  context,
  operationKey: "read",
  recordId: "record",
  phase: "discover",
};
const authorizer = (scope = "company-a"): Authorizer => ({
  async authorize({ permissionCode, resource }) {
    if (permissionCode.endsWith("enter")) return { allowed: true };
    return resource?.companyCodeId === scope || resource?.workspaceId === scope
      ? { allowed: true }
      : { allowed: false, reason: "scope_not_contained" };
  },
});
const scopes = (
  coordinates: EntityScopeCoordinates = { companyCodeId: "company-a" },
): EntityScopeAdapter => ({
  async resolve() {
    return { state: "resolved", coordinates };
  },
  async preflight() {
    return "allowed";
  },
});
const invoice = (auth = authorizer(), adapter = scopes()) =>
  createEntityAccessEvaluator({
    profile: fixture("company-invoice"),
    authorityRevision: "revision",
    authorizer: auth,
    scopes: adapter,
  });

describe("entity access decisions", () => {
  it("authorizes stored company ownership without inheriting shell context", async () => {
    expect((await invoice().evaluate(request)).state).toBe("allowed");
    expect(
      (
        await invoice().evaluate({
          ...request,
          coordinates: { companyCodeId: "company-b" },
        })
      ).state,
    ).toBe("denied");
    expect(
      (await invoice(authorizer("company-b")).evaluate(request)).state,
    ).toBe("denied");
  });
  it("distinguishes discoverable missing scope from execution and explicit deny", async () => {
    const input = { ...request, operationKey: "discover", recordId: undefined };
    expect(
      await invoice(authorizer(), scopes({})).evaluate(input),
    ).toMatchObject({
      state: "context_required",
      missingCoordinates: ["companyCodeId"],
    });
    expect(
      (
        await invoice(authorizer(), scopes({})).evaluate({
          ...input,
          phase: "execute",
        })
      ).state,
    ).toBe("denied");
    const deny: Authorizer = {
      async authorize() {
        return { allowed: false, reason: "denied_by_grant" };
      },
    };
    expect((await invoice(deny, scopes({})).evaluate(input)).state).toBe(
      "denied",
    );
  });
  it("never calls preflight during discovery; rechecks during execution", async () => {
    const preflight = vi.fn(async () => "workflow_blocked" as const),
      evaluator = invoice(authorizer(), { ...scopes(), preflight });
    expect(
      (await evaluator.evaluate({ ...request, operationKey: "update" })).state,
    ).toBe("preflight_required");
    expect(preflight).not.toHaveBeenCalled();
    expect(
      (
        await evaluator.evaluate({
          ...request,
          operationKey: "update",
          phase: "execute",
        })
      ).state,
    ).toBe("workflow_blocked");
    expect(preflight).toHaveBeenCalledTimes(1);
  });
  it("rechecks current grants after discovery and blocks historical mutation", async () => {
    let allowed = true;
    const evaluator = invoice({
      async authorize() {
        return allowed
          ? { allowed: true }
          : { allowed: false, reason: "denied_by_grant" };
      },
    });
    expect((await evaluator.evaluate(request)).state).toBe("allowed");
    allowed = false;
    expect(
      (await evaluator.evaluate({ ...request, phase: "execute" })).state,
    ).toBe("denied");
    expect(
      (
        await invoice().evaluate({
          ...request,
          operationKey: "update",
          historical: true,
          phase: "execute",
        })
      ).state,
    ).toBe("workflow_blocked");
  });
  it("checks the parent and proposed organization for a first assignment", async () => {
    const seen: string[] = [];
    const evaluator = createEntityAccessEvaluator({
      profile: fixture("business-partner"),
      authorityRevision: "revision",
      authorizer: {
        async authorize() {
          return { allowed: true };
        },
      },
      scopes: {
        async resolve(input) {
          seen.push(input.target);
          return {
            state: "resolved",
            coordinates:
              input.target === "proposed"
                ? { operatingOrganizationId: "new-org" }
                : {},
          };
        },
        async preflight() {
          return "allowed";
        },
      },
    });
    expect(
      (
        await evaluator.evaluate({
          ...request,
          operationKey: "assign_organization",
          coordinates: { operatingOrganizationId: "new-org" },
          phase: "execute",
        })
      ).state,
    ).toBe("allowed");
    expect(seen).toEqual(["proposed", "existing"]);
  });
  it("requires independent child authority even when parent is readable", async () => {
    const child = createEntityAccessEvaluator({
      profile: fixture("independent-document"),
      authorityRevision: "revision",
      authorizer: authorizer(),
      scopes: scopes({ workspaceId: "workspace-other" }),
    });
    expect(
      await authorizeEntityRelationship({
        parent: invoice(),
        parentInput: request,
        child,
        childInput: request,
      }),
    ).toBe(false);
  });
  it("masks fields, omits unprofiled fields, rejects raw queries and unauthorized writes", async () => {
    const profile = fixture("independent-document"),
      evaluator = createEntityAccessEvaluator({
        profile,
        authorityRevision: "revision",
        authorizer: {
          async authorize() {
            return { allowed: true };
          },
        },
        scopes: scopes({ workspaceId: "workspace" }),
      });
    expect(
      await projectEntityFields(profile, evaluator, request, {
        id: "id",
        title: "Title",
        protected_value: "secret",
        unpublished: "secret",
      }),
    ).toEqual({ id: "id", title: "Title", protected_value: "••••" });
    await expect(
      assertEntityFieldQuery(
        profile,
        evaluator,
        request,
        "protected_value",
        "filter",
      ),
    ).rejects.toThrow();
    await expect(
      assertEntityFieldWrite(
        fixture("company-invoice"),
        invoice(),
        { ...request, operationKey: "update" },
        { id: "changed", amount: 1 },
      ),
    ).rejects.toThrow("ENTITY_FIELD_WRITE_FORBIDDEN");
    await expect(
      assertEntityFieldWrite(
        fixture("company-invoice"),
        invoice(),
        { ...request, operationKey: "update" },
        { amount: 1 },
      ),
    ).resolves.toBeUndefined();
  });
  it("rejects cross-plane requests and fails closed on resolver outages", async () => {
    expect(
      (
        await invoice().evaluate({
          ...request,
          context: { ...context, planeKey: "mesh" },
        })
      ).state,
    ).toBe("denied");
    expect(
      await invoice(authorizer(), {
        ...scopes(),
        async resolve() {
          throw Error("database secret");
        },
      }).evaluate(request),
    ).toMatchObject({ state: "unavailable", reasonCode: "POLICY_UNAVAILABLE" });
  });
  it("requires installed compatible bindings even if a coarse authorizer would allow", async () => {
    const allowed = invoice({
      async authorize() {
        return { allowed: true };
      },
    });
    expect(
      (
        await allowed.evaluate({
          ...request,
          context: {
            ...context,
            permissions: {
              ...context.permissions,
              operationBindings: undefined,
            },
          },
        })
      ).state,
    ).toBe("denied");
    expect(
      (
        await allowed.evaluate({
          ...request,
          context: {
            ...context,
            permissions: {
              ...context.permissions,
              operationBindings: operationBindings.map((b) => ({
                ...b,
                requiredScopeKinds: [],
              })),
            },
          },
        })
      ).state,
    ).toBe("denied");
  });
  it("rejects raw policy evidence, URLs and inconsistent safe DTOs", () => {
    const dto = {
      schemaVersion: 1,
      state: "denied",
      reasonCode: "ACCESS_DENIED",
      operationKey: "read",
      decisionRef: "ref",
      authorityRevision: "revision",
    };
    expect(() =>
      parseEntityAccessDecision({ ...dto, grantEvidence: ["secret"] }),
    ).toThrow();
    expect(() =>
      parseEntityAccessDecision({
        ...dto,
        missingCoordinates: ["companyCodeId"],
      }),
    ).toThrow();
    expect(() =>
      parseEntityAccessDecision({ ...dto, state: "allowed" }),
    ).toThrow();
  });
});

describe("rollout selection", () => {
  const release: EntityAuthorizationRelease = {
    planeKey: "neon",
    entityCode: "qualification_company_invoice",
    descriptorHash: "a".repeat(64),
    profileHash: "b".repeat(64),
    bindingsHash: "c".repeat(64),
    runtimeVersion: "v1",
  };
  const decision = (state: "allowed" | "denied") =>
    parseEntityAccessDecision({
      schemaVersion: 1,
      state,
      reasonCode: state === "allowed" ? "AUTHORIZED" : "ACCESS_DENIED",
      operationKey: "read",
      decisionRef: "ref",
      authorityRevision: "revision",
    });
  const qualification: EntityAuthorizationQualification = {
    release,
    coverage: entityAuthorizationCoverage,
    unresolvedDifferences: 0,
    grantReviewRef: "review",
    rollbackRef: "rollback",
    revocationWatermark: "current",
    companyEntityQualified: true,
    independentChildQualified: true,
  };
  const options = (mode: "legacy" | "shadow" | "enforce") => ({
    rollout: {
      schemaVersion: 1 as const,
      mode,
      release,
      ...(mode === "enforce" ? { qualificationRef: "receipt" } : {}),
    },
    currentRelease: async () => release,
    legacy: { evaluate: vi.fn(async () => decision("denied")) },
    target: { evaluate: vi.fn(async () => decision("allowed")) },
    writeShadow: vi.fn(async () => {}),
    verifyQualification: async () => qualification,
    currentRevocationWatermark: async () => "current",
    diagnostic: vi.fn(),
  });
  it("never unions shadow allows into legacy denials and records differences", async () => {
    const config = options("shadow"),
      result =
        await createEntityAuthorizationRolloutEvaluator(config).evaluate(
          request,
        );
    expect(result.state).toBe("denied");
    expect(config.writeShadow).toHaveBeenCalledWith(
      expect.objectContaining({
        differs: true,
        legacyState: "denied",
        targetState: "allowed",
      }),
    );
  });
  it("preserves legacy outcomes on target/evidence failures", async () => {
    const config = options("shadow");
    config.writeShadow.mockRejectedValueOnce(Error("offline"));
    expect(
      (
        await createEntityAuthorizationRolloutEvaluator(config).evaluate(
          request,
        )
      ).state,
    ).toBe("denied");
    expect(config.diagnostic).toHaveBeenCalledWith("SHADOW_UNAVAILABLE");
  });
  it("does not invoke target in legacy or legacy in qualified enforce", async () => {
    const legacy = options("legacy");
    await createEntityAuthorizationRolloutEvaluator(legacy).evaluate(request);
    expect(legacy.target.evaluate).not.toHaveBeenCalled();
    const enforced = options("enforce");
    expect(
      (
        await createEntityAuthorizationRolloutEvaluator(enforced).evaluate(
          request,
        )
      ).state,
    ).toBe("allowed");
    expect(enforced.legacy.evaluate).not.toHaveBeenCalled();
  });
  it("rejects missing coverage, unreviewed differences, incompatible releases and stale revocations", async () => {
    for (const override of [
      { coverage: [] },
      { unresolvedDifferences: 1 },
      { companyEntityQualified: false },
      { independentChildQualified: false },
      { grantReviewRef: "" },
      { rollbackRef: "" },
      { revocationWatermark: "old" },
      { release: { ...release, bindingsHash: "d".repeat(64) } },
    ]) {
      const config = options("enforce");
      await expect(
        createEntityAuthorizationRolloutEvaluator({
          ...config,
          verifyQualification: async () => ({ ...qualification, ...override }),
        }).evaluate(request),
      ).rejects.toThrow("NOT_QUALIFIED");
      expect(config.target.evaluate).not.toHaveBeenCalled();
    }
    expect(() =>
      parseEntityAuthorizationRollout({
        schemaVersion: 1,
        mode: "enforce",
        release,
      }),
    ).toThrow();
  });
});

it("returns unavailable for a deferred operation before authority or scope evaluation", async () => {
  const authorize = vi.fn(), resolve = vi.fn(), preflight = vi.fn();
  const evaluator = createEntityAccessEvaluator({
    profile: { ...fixture("business-partner"), deferredOperations: ["deferred_action"] },
    authorityRevision: "revision", authorizer: { authorize }, scopes: { resolve, preflight },
  });
  for (const phase of ["discover", "execute"] as const)
    expect((await evaluator.evaluate({ ...request, phase, operationKey: "deferred_action" })).state).toBe("unavailable");
  expect(authorize).not.toHaveBeenCalled();
  expect(resolve).not.toHaveBeenCalled();
  expect(preflight).not.toHaveBeenCalled();
});

it("diagnostics distinguish binding, ownership and permission failures without exposing them in DTOs", async () => {
  const events: { stage: string }[] = [];
  const base = { profile: fixture("company-invoice"), authorityRevision: "revision", authorizer: authorizer(), scopes: scopes(), diagnostic: (event: { stage: string }) => events.push(event) };
  const badBinding = { ...context, permissions: { ...context.permissions, operationBindings: [] } };
  const result = await createEntityAccessEvaluator(base).evaluate({ ...request, context: badBinding });
  expect(events.at(-1)?.stage).toBe("binding"); expect(result).not.toHaveProperty("stage");
  await createEntityAccessEvaluator({ ...base, scopes: { resolve: async () => ({ state: "invalid" }), preflight: scopes().preflight } }).evaluate(request);
  expect(events.at(-1)?.stage).toBe("ownership");
  await createEntityAccessEvaluator({ ...base, authorizer: { authorize: async () => ({ allowed: false, reason: "missing_permission" }) } }).evaluate(request);
  expect(events.at(-1)?.stage).toBe("permission");
  const throwing = createEntityAccessEvaluator({ ...base, diagnostic: () => { throw Error("telemetry failed"); } });
  expect((await throwing.evaluate(request)).state).toBe("allowed");
  expect(JSON.stringify(events)).not.toContain("company-a");
});
