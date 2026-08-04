import { Client } from "pg";

const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

const constraints = await c.query(`
select
  ns.nspname as schema_name,
  cls.relname as table_name,
  con.conname as constraint_name,
  con.contype,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class cls on cls.oid = con.conrelid
join pg_namespace ns on ns.oid = cls.relnamespace
where
  con.contype in ('u', 'p')
  and (
    (ns.nspname = 'master' and cls.relname in ('tenant', 'legal_entity'))
    or (ns.nspname = 'control' and cls.relname = 'lookup_value')
  )
order by 1, 2, 3;
`);
console.log("--- CONSTRAINTS ---");
console.log(JSON.stringify(constraints.rows, null, 2));

const indexes = await c.query(`
select
  ns.nspname as schema_name,
  cls.relname as table_name,
  idx.relname as index_name,
  i.indisunique,
  i.indpred is not null as is_partial,
  pg_get_indexdef(idx.oid) as indexdef
from pg_index i
join pg_class cls on cls.oid = i.indrelid
join pg_class idx on idx.oid = i.indexrelid
join pg_namespace ns on ns.oid = cls.relnamespace
where
  ns.nspname in ('master', 'control')
  and cls.relname in (
    'tenant', 'legal_entity', 'lookup_value', 'principal', 'company_code',
    'chart_of_account', 'gl_account', 'cost_center', 'company_code_chart_assignment',
    'tax_jurisdiction', 'tax_type', 'payment_term', 'payment_term_discount_tier',
    'asset_class', 'principal_profile', 'principal_identity_binding',
    'auth_group', 'auth_group_role', 'auth_group_member'
  )
  and i.indisunique
order by 1, 2, 3;
`);
console.log("--- UNIQUE INDEXES ---");
console.log(JSON.stringify(indexes.rows, null, 2));

await c.end();
