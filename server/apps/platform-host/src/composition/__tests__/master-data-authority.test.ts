import { afterEach, describe, expect, it } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { createMasterDataAuthority, MASTER_DATA_SENSITIVE_PERMISSIONS } from "@athyper/server-service-master-data";

const databases: Kysely<Record<string, never>>[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.destroy())); });
function fixture() {
  // SQL behavior is covered separately against PostgreSQL. These tests exercise the real
  // IAM evaluator with scoped, verified snapshot evidence and the production authority.
  const db = new Kysely<Record<string, never>>({ dialect: {
    createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(),
    createIntrospector: d => new PostgresIntrospector(d), createQueryCompiler: () => new PostgresQueryCompiler(),
  }, plugins: [{ transformQuery: args => args.node, transformResult: async args => ({ ...args.result, rows: [{ id: "stored-owner-and-org" }] }) }] });
  databases.push(db);
  const root = "neon.relationship.business_partner.read";
  const codes = [root, ...MASTER_DATA_SENSITIVE_PERMISSIONS["profile.read"]];
  const context = {
    planeKey: "neon", tenantId: "tenant", principalId: "principal", assurance: "baseline",
    permissions: { planeKey: "neon", tenantId: "tenant", principalId: "principal", allowed: codes,
      denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [],
      evidence: codes.map(permissionCode => ({ permissionCode, effect: "allow", proof: "role", scopeTargetId: "scope",
        scopeKind: "operating_organization", targetId: "stored-owner-and-org", propagationMode: "exact" })),
      operationBindings: [{ entityCode: "business_partner", operationKey: "read", permissionCode: root,
        decisionMode: "authorize", requiredScopeKinds: ["operating_organization"] }],
      requirements: codes.map(permissionCode => ({ permissionCode, moduleId: "module", riskTier: "low", requiresMfa: false, requiresSod: false, entitled: true })),
    },
  } as unknown as VerifiedRequestContext;
  const metadata = { getEntityDescriptor: async () => ({ entityCode: "business_partner", planeKey: "neon",
    storage: { schema: "master", object: "business_partner", tenantField: "tenant_id", idField: "id" },
    operations: { read: { permissionCode: root } } }) } as unknown as MetadataReader;
  const owner = { entityCode: "business_partner", ownerTypeId: "type", ownerId: "owner" };
  const invoke = (authorizer = createPermissionAuthorizer()) => db.transaction().execute(tx => createMasterDataAuthority(authorizer, metadata)(context, "profile.read", { owner }, tx));
  return { context, invoke, codes };
}
describe("master-data canonical authority with the real IAM evaluator", () => {
  it("accepts root binding plus both exact organization capabilities", async () => { await fixture().invoke(); });
  it.each(["foreign_scope", "explicit_deny", "missing_capability", "missing_binding", "mfa", "entitlement", "sod", "policy"])("preserves %s denial", async scenario => {
    const { context, invoke, codes } = fixture();
    const permissions = context.permissions;
    const sensitive = codes[2]!;
    const changed = scenario === "foreign_scope" ? { evidence: permissions.evidence!.map(item => ({ ...item, targetId: "other-organization" })) }
      : scenario === "explicit_deny" ? { denied: [sensitive] }
      : scenario === "missing_capability" ? { allowed: codes.filter(code => code !== sensitive) }
      : scenario === "missing_binding" ? { operationBindings: [] }
      : { requirements: permissions.requirements!.map(item => item.permissionCode !== sensitive ? item : {
        ...item, requiresMfa: scenario === "mfa", requiresSod: scenario === "sod", entitled: scenario !== "entitlement",
      }) };
    Object.assign(permissions, changed);
    await expect(invoke(scenario === "policy" ? createPermissionAuthorizer({ policyGate: { evaluate: async () => ({ allowed: false }) } }) : undefined)).rejects.toMatchObject({ status: 403 });
  });
});
