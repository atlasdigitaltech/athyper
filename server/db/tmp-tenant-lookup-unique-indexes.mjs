import { Client } from "pg";

const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

const q = await c.query(`
select
  ns.nspname as schema_name,
  cls.relname as table_name,
  idx.relname as index_name,
  pg_get_indexdef(idx.oid) as indexdef
from pg_class idx
join pg_index i on i.indexrelid = idx.oid
join pg_class cls on cls.oid = i.indrelid
join pg_namespace ns on ns.oid = cls.relnamespace
where ns.nspname in ('master', 'control')
  and cls.relname in ('tenant', 'lookup_value', 'auth_group_role')
  and i.indisunique
order by 1, 2, 3;
`);
console.log(JSON.stringify(q.rows, null, 2));

await c.end();
