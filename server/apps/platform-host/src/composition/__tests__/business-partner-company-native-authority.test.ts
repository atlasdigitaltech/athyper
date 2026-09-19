import { describe, it, expect } from "vitest";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { createBusinessPartnerCompanyPilotService } from "@athyper/server-service-master-data";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

const tenant = "44444444-4444-4444-8444-444444444444",
  principal = "22222222-2222-4222-8222-222222222222",
  company = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const permission = "neon.relationship.bp_company_setup_request.create";
function fixture(
  allowed = true,
  entityCode = "master.business_partner_company_setup_request",
) {
  const context = {
    planeKey: "neon",
    realmKey: "athyper",
    tenantId: tenant,
    principalId: principal,
    authEpoch: 1,
    requestId: principal,
    profileHash: "test",
    assurance: "elevated",
    permissions: {
      tenantId: tenant,
      principalId: principal,
      planeKey: "neon",
      allowed: allowed ? [permission] : [],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      authorizationScopes: [],
      operationBindings: [
        {
          entityCode,
          operationKey: "create",
          permissionCode: permission,
          decisionMode: "entity_resource",
          requiredScopeKinds: ["company_code"],
        },
      ],
      evidence: [
        {
          permissionCode: permission,
          effect: "allow",
          proof: "group_role",
          scopeTargetId: company,
          scopeKind: "company_code",
          targetId: company,
          propagationMode: "exact",
        },
      ],
    },
  } as unknown as VerifiedRequestContext;
  const service = createBusinessPartnerCompanyPilotService({
    authorizer: createPermissionAuthorizer(),
    refreshContext: async () => context,
    resolveScope: async (input) =>
      input.coordinates.companyCodeId
        ? { companyCodeId: input.coordinates.companyCodeId }
        : null,
    requirePublishedOperation: async () => {},
    schemas: {
      async resolve() {
        throw Error("AUTHORIZED_SCHEMA_REACHED");
      },
    },
    repository: {} as never,
    transactions: {} as never,
    validator: {} as never,
    workflows: {} as never,
    audit: {} as never,
    outbox: {} as never,
  });
  const command = {
    context,
    kind: "configure_company" as const,
    source: { kind: "manual" as const },
    idempotencyKey: "native-company-create",
    companyCodeId: company,
    operatingOrganizationId: principal,
    targetBusinessPartnerId: principal,
    requestedRole: "customer" as const,
    proposedPayload: {
      ownershipClass: "internal",
      customerType: "intercompany",
    },
  };
  return { service, command };
}
describe("company service through the native permission authorizer", () => {
  it("matches the signed qualified entity binding and exact company grant", async () => {
    const f = fixture();
    await expect(f.service.create(f.command)).rejects.toThrow(
      "AUTHORIZED_SCHEMA_REACHED",
    );
  });
  it("rejects a missing grant even with the signed operation binding", async () => {
    const f = fixture(false);
    await expect(f.service.create(f.command)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("rejects a binding for a different entity and a different company", async () => {
    const f = fixture(true, "business_partner");
    await expect(f.service.create(f.command)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const g = fixture();
    await expect(
      g.service.create({ ...g.command, companyCodeId: principal }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
