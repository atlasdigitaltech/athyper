import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();
const target = process.argv[2] || '';
const where = target
  ? `AND (idx.indexrelid::regclass::text LIKE '${target}%' OR i.indrelid = '${target}'::regclass)`
  : '';

const sql = `
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  i.indexrelid::regclass AS index_name,
  i.indisunique,
  i.indisprimary,
  pg_get_indexdef(i.indexrelid) AS index_def
FROM pg_index i
JOIN pg_class c ON c.oid = i.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_class idx ON idx.oid = i.indexrelid
WHERE n.nspname = 'master'
ORDER BY c.relname, idx.relname;
`;

const res = await client.query(sql);
for (const r of res.rows) {
  console.log(
    `${r.schema_name}.${r.table_name} | unique=${r.indisunique ? 'Y' : 'N'} primary=${r.indisprimary ? 'Y' : 'N'} | ${r.index_name} | ${r.index_def}`
  );
}

await client.end();
