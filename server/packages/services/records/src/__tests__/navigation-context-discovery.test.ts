import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseEntityAuthorizationProfile } from "@athyper/server-contract-metadata";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { entityAuthorizationProfileHash } from "../entity-authorization-rollout.js";
import { canDiscoverScopedNavigation } from "../navigation-context-discovery.js";
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
const descriptor = {
  entityCode: "business_partner",
  authorization: profile,
} as EntityRuntimeDescriptor;
const permission = "neon.relationship.entity_case.read";
const context = {
  tenantId: "tenant",
  principalId: "principal",
  planeKey: "neon",
  permissions: {
    tenantId: "tenant",
    principalId: "principal",
    planeKey: "neon",
    authorizationScopes: [
      {
        permissionCode: permission,
        operatingOrganizationIds: ["org"],
        companyCodeIds: [],
      },
    ],
  },
} as unknown as VerifiedRequestContext;
function authority(allowed = true): Authorizer {
  return {
    enforcedEntityProfile: () => entityAuthorizationProfileHash(profile),
    authorize: vi.fn<Authorizer["authorize"]>(async () =>
      allowed
        ? { allowed: true }
        : { allowed: false, reason: "scope_not_contained" },
    ),
  };
}
it("reauthorizes an exact candidate for read navigation without selecting it", async () => {
  const auth = authority(),
    before = JSON.stringify(context);
  expect(
    await canDiscoverScopedNavigation(
      auth,
      context,
      descriptor,
      "navigate_review",
      permission,
    ),
  ).toBe(true);
  expect(auth.authorize).toHaveBeenCalledWith({
    context,
    permissionCode: permission,
    resource: {
      tenantId: "tenant",
      entityCode: "business_partner",
      resourceCode: "business_partner",
      operationKey: "navigate_review",
      operatingOrganizationId: "org",
    },
  });
  expect(JSON.stringify(context)).toBe(before);
});
it("does not convert stale grants, missing candidates or unavailable authority into discovery", async () => {
  expect(
    await canDiscoverScopedNavigation(
      authority(false),
      context,
      descriptor,
      "navigate_review",
      permission,
    ),
  ).toBe(false);
  expect(
    await canDiscoverScopedNavigation(
      authority(),
      {
        ...context,
        permissions: { ...context.permissions, authorizationScopes: [] },
      },
      descriptor,
      "navigate_review",
      permission,
    ),
  ).toBe(false);
  const auth = authority();
  auth.authorize = vi.fn(async () => ({
    allowed: false,
    reason: "entity_authorization_unavailable",
  }));
  expect(
    await canDiscoverScopedNavigation(
      auth,
      context,
      descriptor,
      "navigate_review",
      permission,
    ),
  ).toBe(false);
});
it("discovers a context-gated destination through ordinary IAM without an enforced backend", async () => {
  const auth: Authorizer = {
    authorize: vi.fn<Authorizer["authorize"]>(async ({ resource }) =>
      resource?.operatingOrganizationId === "org"
        ? { allowed: true }
        : { allowed: false, reason: "scope_not_contained" },
    ),
  };
  expect(
    await canDiscoverScopedNavigation(
      auth,
      context,
      descriptor,
      "navigate_review",
      permission,
    ),
  ).toBe(true);
  expect(auth.authorize).toHaveBeenCalledTimes(1);
  expect(
    await canDiscoverScopedNavigation(
      auth,
      {
        ...context,
        permissions: {
          ...context.permissions,
          authorizationScopes: [
            {
              ...context.permissions.authorizationScopes![0]!,
              operatingOrganizationIds: ["denied-org"],
            },
          ],
        },
      },
      descriptor,
      "navigate_review",
      permission,
    ),
  ).toBe(false);
});
it("rejects proposed commands and mismatched snapshots", async () => {
  const auth = authority();
  expect(
    await canDiscoverScopedNavigation(
      auth,
      context,
      descriptor,
      "request_supplier",
      "neon.relationship.entity_case.create",
    ),
  ).toBe(false);
  expect(
    await canDiscoverScopedNavigation(
      auth,
      { ...context, principalId: "other" },
      descriptor,
      "navigate_review",
      permission,
    ),
  ).toBe(false);
  expect(auth.authorize).not.toHaveBeenCalled();
});
