import { Client } from "pg";

const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

const q = await c.query(`
select
  c.relname as table_name,
  i.relname as index_name,
  ix.indisunique,
  ix.indisprimary,
  pg_get_indexdef(i.oid) as indexdef
from pg_class c
join pg_index ix on c.oid = ix.indrelid
join pg_class i on i.oid = ix.indexrelid
join pg_namespace n on c.relnamespace = n.oid
where n.nspname = 'master' and c.relname = 'tenant'
order by i.relname;
`);
console.log("tenant indexes:", JSON.stringify(q.rows, null, 2));

const q2 = await c.query(`
select
  c.relname as table_name,
  i.relname as index_name,
  ix.indisunique,
  ix.indisprimary,
  pg_get_indexdef(i.oid) as indexdef
from pg_class c
join pg_index ix on c.oid = ix.indrelid
join pg_class i on i.oid = ix.indexrelid
join pg_namespace n on c.relnamespace = n.oid
where n.nspname = 'control' and c.relname = 'lookup_value'
order by i.relname;
`);
console.log("lookup_value indexes:", JSON.stringify(q2.rows, null, 2));

await c.end();
