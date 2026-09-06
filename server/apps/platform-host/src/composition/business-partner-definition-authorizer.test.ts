import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createBusinessPartnerDefinitionAuthorizer } from "./business-partner-definition-authorizer.js";
const permissionCode = "studio.business_partner_definition.publish";
const context: VerifiedRequestContext = {
  planeKey: "studio", realmKey: "athyper", tenantId: "tenant", principalId: "reviewer", authEpoch: 1,
  profileHash: "profile", requestId: "request", assurance: "elevated",
  permissions: { planeKey: "studio", tenantId: "tenant", principalId: "reviewer", principalFingerprint: "fingerprint",
    profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [permissionCode], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [],
    requirements: [{ permissionCode, moduleId: "pub", riskTier: "critical", requiresMfa: true, requiresSod: true, entitled: true }],
  },
};
describe("definition reviewer policy", () => {
  it("uses the tenant-scoped immutable author for independent approval", async () => {
    const get = vi.fn(async () => ({ createdBy: "author" }));
    const decision = await createBusinessPartnerDefinitionAuthorizer({get}).authorize({context,permissionCode,resource:{revisionId:"revision",createdBy:"reviewer"}});
    expect(decision.allowed).toBe(true);
    expect(get).toHaveBeenCalledWith("tenant","revision");
  });
  it("rejects self approval despite caller-provided author evidence", async () => {
    const get = vi.fn(async () => ({ createdBy: "reviewer" }));
    expect(await createBusinessPartnerDefinitionAuthorizer({get}).authorize({context,permissionCode,resource:{revisionId:"revision",createdBy:"other"}})).toMatchObject({allowed:false,reason:"maker_checker_separation_failed"});
  });
  it("rejects missing or tenant-invisible revisions", async () => {
    expect(await createBusinessPartnerDefinitionAuthorizer({get:async()=>null}).authorize({context,permissionCode,resource:{revisionId:"revision"}})).toMatchObject({allowed:false});
  });
  it("requires MFA before consulting revision evidence", async () => {
    const get = vi.fn(async () => ({createdBy:"author"}));
    expect(await createBusinessPartnerDefinitionAuthorizer({get}).authorize({context:{...context,assurance:"baseline"},permissionCode,resource:{revisionId:"revision"}})).toMatchObject({allowed:false,reason:"mfa_required"});
    expect(get).not.toHaveBeenCalled();
  });
  it("does not replace the permission grant or entitlement", async () => {
    const authorizer=createBusinessPartnerDefinitionAuthorizer({get:async()=>({createdBy:"author"})});
    expect(await authorizer.authorize({context:{...context,permissions:{...context.permissions,allowed:[]}},permissionCode,resource:{revisionId:"revision"}})).toMatchObject({allowed:false,reason:"missing_permission"});
    expect(await authorizer.authorize({context:{...context,permissions:{...context.permissions,planLocked:[permissionCode]}},permissionCode,resource:{revisionId:"revision"}})).toMatchObject({allowed:false,reason:"plan_locked"});
  });
});
