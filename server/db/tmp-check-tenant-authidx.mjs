import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();
const r = await c.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='master' AND tablename='tenant' ORDER BY indexname");
console.log(r.rows);
const rr = await c.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='master' AND tablename='auth_group_role' ORDER BY indexname");
console.log('\nauth_group_role');
console.log(rr.rows);
await c.end();
