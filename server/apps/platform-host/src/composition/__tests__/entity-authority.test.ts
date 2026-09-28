import { expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";

function fixture() {
  const permissionCode = "reference.record.read";
  const context = {
    planeKey: "neon", tenantId: "tenant", principalId: "principal", assurance: "baseline",
    permissions: {
      planeKey: "neon", tenantId: "tenant", principalId: "principal",
      allowed: [permissionCode], denied: [], planLocked: [], planeExcluded: [],
      entries: [], authorizationScopes: [],
      evidence: [{ permissionCode, effect: "allow", proof: "role", scopeTargetId: "scope",
        scopeKind: "operating_organization", targetId: "org", propagationMode: "exact" }],
      operationBindings: [{ entityCode: "reference_record", operationKey: "read", permissionCode,
        decisionMode: "authorize", requiredScopeKinds: ["operating_organization"] }],
      requirements: [{ permissionCode, moduleId: "module", riskTier: "low",
        requiresMfa: false, requiresSod: false, entitled: true }],
    },
  } as unknown as VerifiedRequestContext;
  return { context, permissionCode, resource: {
    tenantId: "tenant", entityCode: "reference_record", operationKey: "read",
    operatingOrganizationId: "org", recordId: "record",
  } };
}

it("admits an explicitly bound entity operation within its granted scope", async () => {
  expect(await createPermissionAuthorizer().authorize(fixture())).toMatchObject({ allowed: true });
});

it.each(["foreign_scope", "explicit_deny", "missing_permission", "missing_binding",
  "mfa", "entitlement", "sod", "policy"])("preserves generic %s denial", async scenario => {
  const input = fixture(), permissions = input.context.permissions;
  if (scenario === "foreign_scope") input.resource.operatingOrganizationId = "other";
  if (scenario === "explicit_deny") Object.assign(permissions, { denied: [input.permissionCode] });
  if (scenario === "missing_permission") Object.assign(permissions, { allowed: [] });
  if (scenario === "missing_binding") Object.assign(permissions, { operationBindings: [] });
  if (["mfa", "entitlement", "sod"].includes(scenario))
    Object.assign(permissions, { requirements: permissions.requirements!.map(item => ({
      ...item, requiresMfa: scenario === "mfa", requiresSod: scenario === "sod",
      entitled: scenario !== "entitlement",
    })) });
  const authorizer = createPermissionAuthorizer(scenario === "policy"
    ? { policyGate: { evaluate: async () => ({ allowed: false }) } } : {});
  expect(await authorizer.authorize(input)).toMatchObject({ allowed: false });
});
