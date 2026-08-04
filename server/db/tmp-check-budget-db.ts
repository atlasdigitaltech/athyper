import { Client } from 'pg';
const c=new Client({connectionString:process.env.DATABASE_ADMIN_URL});
await c.connect();
console.log((await c.query(`SELECT source_path, content_sha256 FROM public.seed_pack_ledger_v2 WHERE plane=$1 AND pack_key=$2`, ['neon','tenants/020_technostat/200_finance/510_budget_planning'])).rows[0]);
await c.end();
