import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createRevisionAuthorizer } from "./revision-authorizer.js";
const permissions = { read: "studio.policy.read", author: "studio.policy.author", publish: "studio.policy.publish" };
const createTestAuthorizer = (owner: { get(tenantId: string, revisionId: string): Promise<{ createdBy: string } | null> }) => createRevisionAuthorizer({ ...owner, permissions });
const permissionCode = "studio.policy.publish";
const context: VerifiedRequestContext = {
  planeKey: "studio", realmKey: "athyper", tenantId: "tenant", principalId: "reviewer", authEpoch: 1,
  profileHash: "profile", requestId: "request", assurance: "elevated",
  permissions: { planeKey: "studio", tenantId: "tenant", principalId: "reviewer", principalFingerprint: "fingerprint",
    profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [permissionCode], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [],
    requirements: [{ permissionCode, moduleId: "pub", riskTier: "critical", requiresMfa: true, requiresSod: true, entitled: true }],
  },
};
describe("definition reviewer policy", () => {
  it("requires explicit permission bindings and rejects ambiguous action mappings", async () => {
    const get = vi.fn(async () => ({ createdBy: "author" }));
    expect(await createRevisionAuthorizer({ get }).authorize({ context, permissionCode, resource: { revisionId: "revision" } }))
      .toMatchObject({ allowed: false, reason: "revision_permission_binding_unavailable" });
    expect(get).not.toHaveBeenCalled();
    expect(() => createRevisionAuthorizer({ get, permissions: { ...permissions, author: permissions.publish } }))
      .toThrow("REVISION_PERMISSION_BINDING_INVALID");
  });
  it("uses the tenant-scoped immutable author for independent approval", async () => {
    const get = vi.fn(async () => ({ createdBy: "author" }));
    const decision = await createTestAuthorizer({get}).authorize({context,permissionCode,resource:{revisionId:"revision",createdBy:"reviewer"}});
    expect(decision.allowed).toBe(true);
    expect(get).toHaveBeenCalledWith("tenant","revision","reviewer");
  });
  it("rejects self approval despite caller-provided author evidence", async () => {
    const get = vi.fn(async () => ({ createdBy: "reviewer" }));
    expect(await createTestAuthorizer({get}).authorize({context,permissionCode,resource:{revisionId:"revision",createdBy:"other"}})).toMatchObject({allowed:false,reason:"maker_checker_separation_failed"});
  });
  it("rejects missing or tenant-invisible revisions", async () => {
    expect(await createTestAuthorizer({get:async()=>null}).authorize({context,permissionCode,resource:{revisionId:"revision"}})).toMatchObject({allowed:false});
  });
  it("requires MFA before consulting revision evidence", async () => {
    const get = vi.fn(async () => ({createdBy:"author"}));
    expect(await createTestAuthorizer({get}).authorize({context:{...context,assurance:"baseline"},permissionCode,resource:{revisionId:"revision"}})).toMatchObject({allowed:false,reason:"mfa_required"});
    expect(get).not.toHaveBeenCalled();
  });
  it("does not replace the permission grant or entitlement", async () => {
    const authorizer=createTestAuthorizer({get:async()=>({createdBy:"author"})});
    expect(await authorizer.authorize({context:{...context,permissions:{...context.permissions,allowed:[]}},permissionCode,resource:{revisionId:"revision"}})).toMatchObject({allowed:false,reason:"missing_permission"});
    expect(await authorizer.authorize({context:{...context,permissions:{...context.permissions,planLocked:[permissionCode]}},permissionCode,resource:{revisionId:"revision"}})).toMatchObject({allowed:false,reason:"plan_locked"});
  });
});
