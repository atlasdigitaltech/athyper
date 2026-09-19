import { expect, it, vi } from "vitest";
import type {
  VerifiedRequestContext,
  AuthorizationRequest,
} from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { authorizeListContextDiscovery } from "../list-context-discovery.js";
const org = "11111111-1111-4111-8111-111111111111",
  permissionCode = "neon.relationship.entity_case.read";
const context = {
  tenantId: "tenant",
  principalId: "person",
  planeKey: "neon",
  permissions: {
    tenantId: "tenant",
    principalId: "person",
    planeKey: "neon",
    authorizationScopes: [
      {
        permissionCode,
        operatingOrganizationIds: [org],
        companyCodeIds: [],
        legalEntityIds: [],
        networkMembershipIds: [],
        tenantWide: false,
        visibility: "team",
      },
    ],
  },
} as VerifiedRequestContext;
const descriptor = {
  entityCode: "business_partner_request",
  operations: { read: { code: "read", permissionCode } },
} as EntityRuntimeDescriptor;
const resolution = {
  status: "context_required" as const,
  labels: [],
  workContext: {
    schemaVersion: 1 as const,
    resolver: "platform.document_relationship.v1" as const,
    requiredCoordinates: ["operatingOrganizationId" as const],
  },
};
function setup(allowed = true) {
  const authorize = vi.fn(async (r: AuthorizationRequest) =>
    allowed && r.resource?.operatingOrganizationId === org
      ? { allowed: true as const }
      : { allowed: false as const, reason: "entity_authorization_denied" },
  );
  const resolve = vi.fn(async () => ({
    status: "ready" as const,
    authorizationResource: { operatingOrganizationId: org },
    constraints: [],
    labels: [],
    fingerprintMaterial: {},
  }));
  return {
    input: {
      authorizer: { authorize },
      context,
      descriptor,
      resolution,
      resolver: { resolve },
    },
    authorize,
    resolve,
  };
}
it("admits only selector metadata after catalog and current target authorization", async () => {
  const s = setup();
  expect(await authorizeListContextDiscovery(s.input)).toEqual({
    allowed: true,
  });
  expect(s.resolve).toHaveBeenCalledWith(
    expect.objectContaining({ coordinate: { operatingOrganizationId: org } }),
  );
  expect(
    s.authorize.mock.calls.every(([r]) => r.resource?.tenantId === "tenant"),
  ).toBe(true);
  expect(s.input.resolution.status).toBe("context_required");
});
it("never treats a stale candidate grant as an allow", async () => {
  const s = setup(false);
  await expect(authorizeListContextDiscovery(s.input)).rejects.toMatchObject({
    statusCode: 403,
  });
});
it("does not use profile/session defaults when no granted coordinate exists", async () => {
  const s = setup();
  await expect(
    authorizeListContextDiscovery({
      ...s.input,
      context: {
        ...context,
        permissions: { ...context.permissions, authorizationScopes: [] },
      },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(s.resolve).not.toHaveBeenCalled();
});
it("rejects candidates invalidated by the scope catalog", async () => {
  const s = setup();
  await expect(
    authorizeListContextDiscovery({
      ...s.input,
      resolver: {
        resolve: async () => ({
          status: "forbidden",
          code: "SCOPE_INVALID",
          message: "Unavailable",
        }),
      },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(s.authorize).toHaveBeenCalledTimes(1);
});
it("does not retry an unavailable authorizer", async () => {
  const s = setup();
  await expect(
    authorizeListContextDiscovery({
      ...s.input,
      authorizer: {
        authorize: async () => ({
          allowed: false,
          reason: "entity_authorization_unavailable",
        }),
      },
    }),
  ).rejects.toMatchObject({ statusCode: 503 });
  expect(s.resolve).not.toHaveBeenCalled();
});
it("rejects a mismatched permission snapshot", async () => {
  const s = setup();
  await expect(
    authorizeListContextDiscovery({
      ...s.input,
      context: {
        ...context,
        permissions: { ...context.permissions, principalId: "other" },
      },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(s.authorize).not.toHaveBeenCalled();
});
