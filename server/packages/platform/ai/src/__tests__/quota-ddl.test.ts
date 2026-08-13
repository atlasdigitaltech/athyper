import{readFileSync}from"node:fs";
import{describe,expect,it}from"vitest";

const ddl=(name:string)=>readFileSync(new URL(`../../../../../db/ddl/common/ai/${name}`,import.meta.url),"utf8");
describe("Atlas durable quota DDL",()=>{it("defines tenant-scoped policy, window, reservation, locking support, RLS, and grants",()=>{const tables=ddl("03_tables.sql"),constraints=ddl("05_constraints.sql"),indexes=ddl("06_indexes.sql"),rls=ddl("10_rls.sql"),grants=ddl("11_grants.sql");for(const table of ["atlas_tenant_quota_policy","atlas_tenant_quota_window","atlas_tenant_quota_reservation"]){expect(tables).toContain(`\"ai\".\"${table}\"`);expect(rls).toContain(`ALTER TABLE \"ai\".\"${table}\" ENABLE ROW LEVEL SECURITY`);expect(grants).toContain(`\"ai\".\"${table}\"`);}expect(constraints).toContain("atlas_tenant_quota_reservation_window_fk");expect(constraints).toContain("atlas_tenant_quota_reservation_terminal_chk");expect(indexes).toContain("atlas_tenant_quota_reservation_expiry_idx");});});
