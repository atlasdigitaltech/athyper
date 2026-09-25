import { describe, expect, it, vi } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Transaction } from "kysely";
import { readPartnerCompanyProfile, type PartnerCompanyProfileScope } from "./company-profiles-reader.js";

const scope: PartnerCompanyProfileScope = {
  tenantId: "44444444-4444-4444-8444-444444444444", businessPartnerId: "11111111-1111-4111-8111-111111111111",
  operatingOrganizationId: "22222222-2222-4222-8222-222222222222", companyCodeId: "33333333-3333-4333-8333-333333333333",
  capability: "supplier",
};
function database() {
  const queries: string[] = [];
  const db = new Kysely<Record<string, never>>({ dialect: {
    createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(),
    createIntrospector: db => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler(),
  }, log: event => { queries.push(event.query.sql); } });
  return { queries, tx: db as unknown as Transaction<Record<string, never>> };
}
describe("Partner-owned company profile provider", () => {
  it.each(["supplier", "customer"] as const)("uses %s profile with partner identity, not a role identity", async capability => {
    const { queries, tx } = database();
    const authorize = vi.fn(async () => true);
    expect(await readPartnerCompanyProfile({ ...scope, capability }, tx, authorize)).toBeNull();
    expect(authorize).toHaveBeenCalledWith({ ...scope, capability }, tx);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain(`"master"."company_code_${capability}_profile"`);
    expect(queries[0]).toContain("b.id=p.business_partner_id");
    expect(queries[0]).not.toMatch(/master\.(supplier|customer)\b|\b(supplier_id|customer_id)\b/);
    expect(queries[0]).toContain("c.company_code_id=p.company_code_id");
    expect(queries[0]).toContain("c.operating_organization_id=");
    expect(queries[0]).not.toContain("business_partner_operating_organization_assignment");
    expect(queries[0]).not.toContain(`AND b.${capability}_enabled`);
  });
  it("denies before querying", async () => {
    const { queries, tx } = database();
    await expect(readPartnerCompanyProfile(scope, tx, async () => false)).rejects.toMatchObject({ status: 403 });
    expect(queries).toEqual([]);
  });
  it("does not infer company coverage from missing context", async () => {
    const { queries, tx } = database();
    const authorize = vi.fn(async () => true);
    await expect(readPartnerCompanyProfile({ ...scope, companyCodeId: "" }, tx, authorize)).rejects.toMatchObject({ status: 400 });
    expect(authorize).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
  });
});
