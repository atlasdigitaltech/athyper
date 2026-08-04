import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

const tables = ['principal', 'tenant', 'legal_entity', 'control.lookup_value'];

for (const tab of tables) {
  const [schema, name] = tab.includes('.') ? tab.split('.') : ['master', tab];
  const r = await client.query(
    'SELECT indexname, indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=$2 ORDER BY indexname',
    [schema, name],
  );
  console.log(`\\n${tab}`);
  for (const row of r.rows) {
    console.log(`  ${row.indexname} => ${row.indexdef}`);
  }
}

await client.end();
