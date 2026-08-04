import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

const r = await client.query(`
  SELECT n.nspname AS schema_name, c.relname AS table_name, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('master','control')
    AND c.relkind = 'r'
  ORDER BY 1,2
`);

for (const row of r.rows) {
  console.log(`${row.schema_name}.${row.table_name}`);
}

await client.end();
