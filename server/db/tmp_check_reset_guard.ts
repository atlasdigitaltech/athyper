import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL! });
await c.connect();
const { rows } = await c.query('SELECT plane, database_name, environment_class, destructive_reset_allowed, approval_ticket, schema_fingerprint_sha256, marked_at FROM public.database_reset_guard_v2 WHERE plane=$1', ['neon']);
console.log(JSON.stringify(rows, null, 2));
await c.end();
