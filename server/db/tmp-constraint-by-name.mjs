import { Client } from "pg";

const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

const names = [
  "tenant_realm_code_uq",
  "tenant_pkey",
  "master.company_code_fy_variant_pkey",
  "lookup_value_global_uq",
  "tenant_tenant_code_uq",
  "control_lookup_domain_code_uq"
];

for (const name of names) {
  const q = `
    select c.conname, n.nspname, cl.relname
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.conname = $1;
  `;
  const r = await c.query(q, [name]);
  console.log(`${name}: ${r.rows.length}`);
  if (r.rows.length) console.log(r.rows[0]);
}

const idx = await c.query(`
select i.relname as index_name, t.relname as table_name, n.nspname as schema_name, pg_get_indexdef(i.oid) as indexdef
from pg_class i
join pg_index ix on i.oid = ix.indexrelid
join pg_class t on t.oid = ix.indrelid
join pg_namespace n on n.oid = t.relnamespace
where i.relname = 'lookup_value_global_uq'
order by 1;
`);
console.log("lookup_value_global_uq index:");
console.log(idx.rows);

await c.end();
