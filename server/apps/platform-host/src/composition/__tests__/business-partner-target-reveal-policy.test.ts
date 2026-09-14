import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { expect, it } from "vitest";
import type { AuthorizationRequest } from "@athyper/server-contract-auth";
import type { EntityAuthorizationProfileV1 } from "@athyper/server-contract-metadata";
import { isPublishedBusinessPartnerTargetReveal } from "../business-partner-target-read-policy.js";
const profile = {
  entityCode: "business_partner",
  planeKey: "neon",
  operations: ["bank_reveal", "tax_reveal"].map((key) => ({
    key,
    permissionCode: `neon.relationship.bp_target.${key}`,
    effect: "reveal",
    target: "existing",
    requiresParentRead: true,
    requiresPreflight: true,
  })),
} as EntityAuthorizationProfileV1;
const request = {
  context: { tenantId: "tenant", planeKey: "neon", assurance: "elevated" },
  permissionCode: "neon.relationship.bp_target.bank_reveal",
  resource: { entityCode: "business_partner", operationKey: "bank_reveal" },
} as AuthorizationRequest;
it("admits only a published protected reveal with parent read and preflight", () => {
  expect(
    isPublishedBusinessPartnerTargetReveal(request, profile, "tenant"),
  ).toBe(true);
  expect(
    isPublishedBusinessPartnerTargetReveal(
      {
        ...request,
        permissionCode: "neon.relationship.bp_target.tax_reveal",
        resource: {
          entityCode: "business_partner",
          operationKey: "tax_reveal",
        },
      },
      profile,
      "tenant",
    ),
  ).toBe(true);
  for (const change of [
    { requiresParentRead: false },
    { requiresPreflight: false },
    { effect: "read" },
    { target: "proposed" },
    { permissionCode: "other" },
  ]) {
    const changed = {
      ...profile,
      operations: profile.operations.map((op) => ({ ...op, ...change })),
    } as EntityAuthorizationProfileV1;
    expect(
      isPublishedBusinessPartnerTargetReveal(request, changed, "tenant"),
    ).toBe(false);
  }
});
it("rejects missing, deferred, wrong-tenant, wrong-plane and unelevated requests", () => {
  expect(
    isPublishedBusinessPartnerTargetReveal(request, undefined, "tenant"),
  ).toBe(false);
  expect(
    isPublishedBusinessPartnerTargetReveal(request, profile, undefined),
  ).toBe(false);
  expect(
    isPublishedBusinessPartnerTargetReveal(
      request,
      { ...profile, deferredOperations: ["bank_reveal"] },
      "tenant",
    ),
  ).toBe(false);
  for (const context of [
    { ...request.context, tenantId: "other" },
    { ...request.context, planeKey: "studio" as const },
    { ...request.context, assurance: "normal" as const },
  ])
    expect(
      isPublishedBusinessPartnerTargetReveal(
        { ...request, context },
        profile,
        "tenant",
      ),
    ).toBe(false);
  expect(
    isPublishedBusinessPartnerTargetReveal(
      {
        ...request,
        resource: { entityCode: "entity_case", operationKey: "bank_reveal" },
      },
      profile,
      "tenant",
    ),
  ).toBe(false);
});
it("does not replace IAM grants, denies, MFA or separation of duties", async () => {
  const permissionCode = request.permissionCode;
  const permissions = {
    tenantId: "tenant",
    principalId: "reader",
    planeKey: "neon" as const,
    allowed: [permissionCode],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
    requirements: [
      {
        permissionCode,
        moduleId: "bp",
        entitled: true,
        riskTier: "high" as const,
        requiresMfa: true,
        requiresSod: false,
      },
    ],
  };
  const context = { ...request.context, principalId: "reader", permissions };
  const authorizer = createPermissionAuthorizer({
    policyGate: {
      evaluate: async (input) => ({
        allowed: isPublishedBusinessPartnerTargetReveal(
          input,
          profile,
          "tenant",
        ),
      }),
    },
  });
  expect((await authorizer.authorize({ ...request, context })).allowed).toBe(
    true,
  );
  for (const changes of [
    { allowed: [] },
    { denied: [permissionCode] },
    { requirements: [{ ...permissions.requirements[0]!, requiresSod: true }] },
  ])
    expect(
      (
        await authorizer.authorize({
          ...request,
          context: { ...context, permissions: { ...permissions, ...changes } },
        })
      ).allowed,
    ).toBe(false);
  expect(
    (
      await authorizer.authorize({
        ...request,
        context: { ...context, assurance: "normal" },
      })
    ).allowed,
  ).toBe(false);
});
