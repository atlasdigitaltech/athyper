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

  it("never widens exact record ACL evidence into an unscoped permission", async () => {
    const aclContext: VerifiedRequestContext = {
      ...context,
      permissions: {
        ...context.permissions,
        allowed: ["documents.read"],
        denied: [],
        authorizationScopes: [],
        evidence: [{
          permissionCode: "documents.read",
          effect: "allow",
          proof: "record_acl",
          scopeTargetId: "tenant-scope",
          scopeKind: "tenant",
          targetId: context.tenantId,
          propagationMode: "exact",
          resourceCode: "document.invoice",
          recordId: "record-a",
        }],
      },
    };

    await expect(createPermissionAuthorizer().authorize({ context: aclContext, permissionCode: "documents.read" }))
      .resolves.toEqual({ allowed: false, reason: "resource_required" });
    await expect(createPermissionAuthorizer().authorize({
      context: aclContext,
      permissionCode: "documents.read",
      resource: { tenantId: context.tenantId, resourceCode: "document.invoice", recordId: "record-b" },
    })).resolves.toEqual({ allowed: false, reason: "scope_not_contained" });
    await expect(createPermissionAuthorizer().authorize({
      context: aclContext,
      permissionCode: "documents.read",
      resource: { tenantId: context.tenantId, resourceCode: "document.invoice", recordId: "record-a" },
    })).resolves.toEqual({ allowed: true });
  });

  it("enforces entitlement, MFA, SoD, hard policy, and published operation bindings centrally", async () => {
    const secured: VerifiedRequestContext = {
      ...context,
      assurance: "baseline",
      permissions: {
        ...context.permissions,
        requirements: [{ permissionCode: "records.read", moduleId: "module-1", riskTier: "critical", requiresMfa: true, requiresSod: true, entitled: true }],
        operationBindings: [{ entityCode: "finance.invoice", operationKey: "read", permissionCode: "records.read", decisionMode: "authorize", requiredScopeKinds: ["legal_entity"] }],
      },
    };
    const resource = { tenantId: context.tenantId, entityCode: "finance.invoice", operationKey: "read", legalEntityId: "legal-1" };
    await expect(createPermissionAuthorizer().authorize({ context: secured, permissionCode: "records.read", resource }))
      .resolves.toEqual({ allowed: false, reason: "mfa_required" });
    await expect(createPermissionAuthorizer().authorize({ context: { ...secured, assurance: "elevated" }, permissionCode: "records.read", resource }))
      .resolves.toEqual({ allowed: false, reason: "sod_evidence_required" });
    await expect(createPermissionAuthorizer({ policyGate: { evaluate: async () => ({ allowed: false, reason: "policy_denied" }) } }).authorize({ context: { ...secured, assurance: "elevated" }, permissionCode: "records.read", resource }))
      .resolves.toEqual({ allowed: false, reason: "policy_denied" });
    await expect(createPermissionAuthorizer({ policyGate: { evaluate: async () => ({ allowed: true, sodSatisfied: true }) } }).authorize({ context: { ...secured, assurance: "elevated" }, permissionCode: "records.read", resource }))
      .resolves.toMatchObject({ allowed: true });
  });

  it("fails closed for an unentitled permission or mismatched operation mapping", async () => {
    const secured: VerifiedRequestContext = { ...context, permissions: { ...context.permissions,
      requirements: [{ permissionCode: "records.read", moduleId: "module-1", riskTier: "low", requiresMfa: false, requiresSod: false, entitled: false }],
      operationBindings: [{ entityCode: "finance.invoice", operationKey: "read", permissionCode: "records.read", decisionMode: "authorize", requiredScopeKinds: [] }],
    } };
    await expect(createPermissionAuthorizer().authorize({ context: secured, permissionCode: "records.read" }))
      .resolves.toEqual({ allowed: false, reason: "entitlement_unavailable" });
    const entitled = { ...secured, permissions: { ...secured.permissions, requirements: secured.permissions.requirements!.map((item) => ({ ...item, entitled: true })) } };
    await expect(createPermissionAuthorizer().authorize({ context: entitled, permissionCode: "records.read", resource: { entityCode: "finance.invoice", operationKey: "delete" } }))
      .resolves.toEqual({ allowed: false, reason: "operation_binding_missing" });
  });
});
