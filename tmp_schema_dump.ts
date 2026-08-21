import { Client } from 'pg';

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await c.connect();
  const tables = ['business_partner', 'customer', 'supplier', 'customer_app_index', 'customer_qualification', 'company_code_customer_profile'];
  for (const t of tables) {
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='master' AND table_name=$1 ORDER BY ordinal_position`, [t]);
    console.log(`\nmaster.${t}`);
    console.log(r.rows.map((x: any) => x.column_name).join(', '));
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
