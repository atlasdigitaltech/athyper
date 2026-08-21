import { Client } from 'pg';
async function main() {
 const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
 await c.connect();
 const tables=['business_partner','customer','supplier','customer_app_index','customer_qualification','company_code_customer_profile','customer_block','customer_qualification'];
 for (const t of tables){
   const r = await c.query(`SELECT to_regclass('master.'||$1) AS reg`, [t]);
   console.log(`master.${t}:`, r.rows[0].reg);
 }
 await c.end();
}
main().catch(e=>{console.error(e); process.exit(1)});
