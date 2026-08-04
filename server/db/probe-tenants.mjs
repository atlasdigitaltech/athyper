import { Client } from "pg";
const db = new Client({connectionString: process.env.DATABASE_ADMIN_URL ?? "postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_neon?sslmode=disable"});
await db.connect();
const rows = await db.query(`
select t.id::text, t.code,
       exists(select 1 from master.org_unit o where o.tenant_id=t.id and o.code='organization' and o.status='active') as has_org_org,
       exists(select 1 from master.legal_entity l where l.tenant_id=t.id and l.status='active') as has_legal,
       exists(select 1 from master.company_code c where c.tenant_id=t.id and c.status='active') as has_company,
       exists(select 1 from master.company_code_book_assignment a where a.tenant_id=t.id and a.status='active') as has_book,
       coalesce((select count(*) from control.tax_group g where g.tenant_id=t.id and g.status='active' and g.jurisdiction_id is null),0) as null_juris_tg,
       coalesce((select count(*) from master.chart_of_account coa where coa.tenant_id=t.id and coa.status='active'),0) as active_coa
from master.tenant t order by code;
`);
console.table(rows.rows);
await db.end();
