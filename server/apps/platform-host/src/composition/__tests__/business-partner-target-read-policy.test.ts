import { expect, it } from "vitest";
import type {
  AuthorizationRequest,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { EntityAuthorizationProfileV1 } from "@athyper/server-contract-metadata";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { isPublishedBusinessPartnerTargetRead } from "../business-partner-target-read-policy.js";
const tenant = "44444444-4444-4444-8444-444444444444",
  permissionCode = "neon.relationship.bp_target.read";
const profile = {
  entityCode: "business_partner",
  planeKey: "neon",
  operations: [
    { key: "read", permissionCode, effect: "read" },
    {
      key: "import",
      permissionCode: "neon.relationship.bp_target.import",
      effect: "write",
    },
    {
      key: "reveal",
      permissionCode: "neon.relationship.bp_target.reveal",
      effect: "reveal",
    },
  ],
} as EntityAuthorizationProfileV1;
const context = {
  tenantId: tenant,
  principalId: "reader",
  planeKey: "neon",
  assurance: "elevated",
  permissions: {
    tenantId: tenant,
    principalId: "reader",
    planeKey: "neon",
    allowed: [permissionCode],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    authorizationScopes: [],
  },
} as unknown as VerifiedRequestContext;
const request: AuthorizationRequest = {
  context,
  permissionCode,
  resource: {
    tenantId: tenant,
    entityCode: "business_partner",
    operationKey: "read",
  },
};
it("recognizes only the selected published read operation", () => {
  expect(isPublishedBusinessPartnerTargetRead(request, profile, tenant)).toBe(
    true,
  );
  for (const r of [
    { ...request, permissionCode: "neon.relationship.bp_target.unknown" },
    { ...request, resource: { ...request.resource, operationKey: "missing" } },
    {
      ...request,
      resource: { ...request.resource, entityCode: "entity_case" },
    },
    { ...request, context: { ...context, tenantId: "other" } },
    {
      ...request,
      permissionCode: "neon.relationship.bp_target.import",
      resource: { ...request.resource, operationKey: "import" },
    },
    {
      ...request,
      permissionCode: "neon.relationship.bp_target.reveal",
      resource: { ...request.resource, operationKey: "reveal" },
    },
  ])
    expect(isPublishedBusinessPartnerTargetRead(r, profile, tenant)).toBe(
      false,
    );
  expect(
    isPublishedBusinessPartnerTargetRead(
      request,
      { ...profile, deferredOperations: ["read"] },
      tenant,
    ),
  ).toBe(false);
  expect(isPublishedBusinessPartnerTargetRead(request, undefined, tenant)).toBe(
    false,
  );
  expect(
    isPublishedBusinessPartnerTargetRead(request, profile, undefined),
  ).toBe(false);
});
it("preserves real IAM grant, denial, MFA and separation-of-duties checks", async () => {
  const authorizer = createPermissionAuthorizer({
    policyGate: {
      evaluate: async (input) => ({
        allowed: isPublishedBusinessPartnerTargetRead(input, profile, tenant),
      }),
    },
  });
  expect(await authorizer.authorize(request)).toMatchObject({ allowed: true });
  for (const changes of [
    { allowed: [] },
    { denied: [permissionCode] },
    {
      requirements: [
        {
          permissionCode,
          moduleId: "module",
          entitled: true,
          riskTier: "low" as const,
          requiresMfa: false,
          requiresSod: true,
        },
      ],
    },
  ])
    expect(
      await authorizer.authorize({
        ...request,
        context: {
          ...context,
          permissions: { ...context.permissions, ...changes },
        },
      }),
    ).toMatchObject({ allowed: false });
  expect(
    await authorizer.authorize({
      ...request,
      context: {
        ...context,
        assurance: "normal",
        permissions: {
          ...context.permissions,
          requirements: [
            {
              permissionCode,
              moduleId: "module",
              entitled: true,
              riskTier: "low",
              requiresMfa: true,
              requiresSod: false,
            },
          ],
        },
      } as VerifiedRequestContext,
    }),
  ).toMatchObject({ allowed: false, reason: "mfa_required" });
});
