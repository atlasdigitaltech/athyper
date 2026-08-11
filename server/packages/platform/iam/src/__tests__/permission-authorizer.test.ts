import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPermissionAuthorizer } from "../permission-authorizer.js";

const context: VerifiedRequestContext = {
  planeKey: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 1,
  profileHash: "profile", requestId: "request-1",
  permissions: {
    planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "fingerprint",
    profileHash: "profile", schemaHash: "schema", resolvedAt: 1,
    allowed: ["records.read", "records.denied"], denied: ["records.denied"], planLocked: [], planeExcluded: [], entries: [],
    authorizationScopes: [{ permissionCode: "records.read", tenantWide: false, legalEntityIds: ["legal-1"], companyCodeIds: [], operatingOrganizationIds: [], networkMembershipIds: [], visibility: "team" }],
  },
};

describe("permission authorizer", () => {
  it("returns the published scope for an allowed permission", async () => {
    await expect(createPermissionAuthorizer().authorize({ context, permissionCode: "records.read" }))
      .resolves.toMatchObject({ allowed: true, scope: { legalEntityIds: ["legal-1"], visibility: "team" } });
  });

  it("gives an explicit deny precedence over allow", async () => {
    await expect(createPermissionAuthorizer().authorize({ context, permissionCode: "records.denied" }))
      .resolves.toEqual({ allowed: false, reason: "denied_by_grant" });
  });
});
