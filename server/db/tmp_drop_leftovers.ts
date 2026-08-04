import { Client } from 'pg';
const allowed = new Set([
  'shared','control','master','document','ledger','log','event','governance','snapshot','aggregate','public'
]);
const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL! });
await c.connect();
const { rows } = await c.query("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname");
for (const { nspname } of rows) {
  if (allowed.has(nspname)) continue;
  await c.query(`DROP SCHEMA IF EXISTS \"${nspname}\" CASCADE`);
  console.log('dropped', nspname);
}
await c.end();
