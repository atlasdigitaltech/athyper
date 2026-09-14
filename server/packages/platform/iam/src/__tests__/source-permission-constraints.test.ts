import { expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPermissionAuthorizer } from "../permission-authorizer.js";
const code = "legacy.read";
const context = {
  tenantId: "tenant",
  principalId: "principal",
  planeKey: "neon",
  assurance: "elevated",
  permissions: {
    tenantId: "tenant",
    principalId: "principal",
    planeKey: "neon",
    allowed: [],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    authorizationScopes: [],
    evidence: [],
    requirements: [
      {
        permissionCode: code,
        moduleId: "module",
        entitled: true,
        riskTier: "low",
        requiresMfa: false,
        requiresSod: false,
      },
    ],
  },
} as unknown as VerifiedRequestContext;
const request = {
  context,
  permissionCode: code,
  resource: { tenantId: "tenant" },
};
it("constraint satisfaction never grants the source permission", async () => {
  const authority = createPermissionAuthorizer();
  expect(await authority.checkSourceConstraints!(request)).toEqual({
    state: "satisfied",
  });
  expect(await authority.authorize(request)).toEqual({
    allowed: false,
    reason: "missing_permission",
  });
});
it("retains denials, tenancy, catalog, assurance and domain constraints", async () => {
  const check = async (
    changes: Partial<VerifiedRequestContext["permissions"]>,
  ) =>
    createPermissionAuthorizer().checkSourceConstraints!({
      ...request,
      context: {
        ...context,
        permissions: { ...context.permissions, ...changes },
      },
    });
  for (const changes of [
    { denied: [code] },
    { planLocked: [code] },
    { planeExcluded: [code] },
  ])
    expect(await check(changes)).toMatchObject({ state: "denied" });
  expect(await check({ requirements: [] })).toEqual({
    state: "unavailable",
    reason: "source_requirement_unavailable",
  });
  expect(
    await createPermissionAuthorizer().checkSourceConstraints!({
      ...request,
      resource: { tenantId: "other" },
    }),
  ).toMatchObject({ state: "denied", reason: "tenant_boundary_failed" });
  for (const requirement of [
    { entitled: false },
    { requiresMfa: true },
    { requiresSod: true },
    { riskTier: "critical" as const },
  ]) {
    const r = {
      ...request,
      context: {
        ...context,
        assurance: "normal",
        permissions: {
          ...context.permissions,
          requirements: [
            { ...context.permissions.requirements![0]!, ...requirement },
          ],
        },
      } as VerifiedRequestContext,
    };
    expect(
      await createPermissionAuthorizer().checkSourceConstraints!(r),
    ).toMatchObject({ state: "denied" });
  }
  expect(
    await createPermissionAuthorizer({
      policyGate: {
        evaluate: async () => ({ allowed: false, reason: "domain_denial" }),
      },
    }).checkSourceConstraints!(request),
  ).toEqual({ state: "denied", reason: "domain_denial" });
});
it("reads missing requirements from the current catalog and closes on lookup failure", async () => {
  const r = {
    ...request,
    context: {
      ...context,
      permissions: { ...context.permissions, requirements: [] },
    },
  };
  expect(
    await createPermissionAuthorizer({
      readSourceRequirement: async () => context.permissions.requirements![0]!,
    }).checkSourceConstraints!(r),
  ).toEqual({ state: "satisfied" });
  expect(
    await createPermissionAuthorizer({
      readSourceRequirement: async () => {
        throw Error("offline");
      },
    }).checkSourceConstraints!(r),
  ).toMatchObject({ state: "unavailable" });
});
