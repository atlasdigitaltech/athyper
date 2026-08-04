import { Client } from 'pg';
const url = process.env.DATABASE_ADMIN_URL ?? 'postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_neon?sslmode=disable';
const client = new Client({ connectionString: url });
await client.connect();
const r = await client.query(`select current_database(), current_user`);
console.log(r.rows[0]);
const t = await client.query(`select id::text, code, status from master.tenant where status='active' order by code limit 10`);
console.log('tenants', t.rows);
await client.end();
