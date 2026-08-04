import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import pg from 'pg';

const repoRoot = resolve('D:/Products/athyper');
const seedRoot = resolve(repoRoot, 'server/db/seed');

const c = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();
const row = (await c.query("SELECT pack_key, source_path FROM public.seed_pack_ledger_v2 WHERE plane='neon' AND pack_key='tenants/020_technostat/003a_tenant_profile'" )).rows[0];
await c.end();

const p1 = join(seedRoot, `${row.pack_key}.sql`);
const p2 = join(seedRoot, row.source_path);
console.log('pack_key:', row.pack_key);
console.log('source_path:', row.source_path);
console.log('p1', p1, existsSync(p1));
console.log('p2', p2, existsSync(p2));
