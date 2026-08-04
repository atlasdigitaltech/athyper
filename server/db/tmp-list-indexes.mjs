import { Client } from 'pg';

const tables = [
  'tenant',
  'principal',
  'legal_entity',
  'company_code',
  'chart_of_account',
  'gl_account',
  'fiscal_period',
  'lookup_value',
];

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

for (const tab of tables) {
  const r = await client.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='master' AND tablename=$1 ORDER BY indexname",
    [tab],
  );
  console.log(`\\nmaster.${tab}`);
  for (const row of r.rows) {
    console.log(`  ${row.indexname}: ${row.indexdef}`);
  }
}

const compat = await client.query(
  "SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE indexname LIKE 'seed_compat_%' ORDER BY schemaname, tablename, indexname"
);
console.log('\\ncompatibility indexes');
for (const row of compat.rows) {
  console.log(`${row.schemaname}.${row.tablename} :: ${row.indexname} -> ${row.indexdef}`);
}

const ctrl = await client.query(
  "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='control' ORDER BY tablename, indexname LIMIT 200"
);
console.log('\\ncontrol (sample)');
for (const row of ctrl.rows) {
  console.log(`  ${row.indexname}: ${row.indexdef}`);
}

await client.end();
