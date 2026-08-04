import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL});
await c.connect();
const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='seed_pack_execution_v2' ORDER BY ordinal_position`);
console.log('exec cols', r.rows.map(r=>r.column_name));
const r2 = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='seed_pack_ledger_v2' ORDER BY ordinal_position`);
console.log('ledger cols', r2.rows.map(r=>r.column_name));
await c.end();
