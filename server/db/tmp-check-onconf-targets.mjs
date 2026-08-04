import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();
const tables=['tenant','payment_term','company_code_chart_assignment','auth_group_role','principal'];
for (const t of tables){
  const r = await c.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='master' AND tablename=$1 ORDER BY indexname",[t]);
  console.log('\n',t);for(const row of r.rows){console.log(row.indexname, row.indexdef)}
}
const r2 = await c.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='control' AND tablename=$1 ORDER BY indexname",['tax_rate_schedule']);
console.log('\ncontrol.tax_rate_schedule'); for (const row of r2.rows) console.log(row.indexname,row.indexdef);
await c.end();
