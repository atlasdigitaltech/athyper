import fs from 'node:fs';
import { Client } from 'pg';

const sql = fs.readFileSync('server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql', 'utf8');
const re = /INSERT\s+INTO\s+([\w\.]+)[\s\S]*?ON\s+CONFLICT\s*\(([^)]*)\)\s*DO\b/gi;

const targets = [];
let m;
while ((m = re.exec(sql)) !== null) {
  const table = m[1].toLowerCase();
  const cols = m[2]
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z_]+\./g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const key = `(${cols.join(', ')})`;
  targets.push({ table, cols, key });
}

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

for (const t of targets) {
  const [schema, table] = t.table.split('.');
  const schemaName = schema || 'public';
  const r = await client.query(
    'SELECT indexname, indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=$2',
    [schemaName, table],
  );
  const normalized = t.cols.join(',');
  const match = r.rows.some((row) => {
    const idx = row.indexdef.toLowerCase();
    return idx.includes(`(${t.cols.join(', ')})`) || idx.includes(`(${normalized})`);
  });
  if (!match) {
    console.log(`NO-MATCH: ${t.table} ON CONFLICT ${t.key}`);
    for (const row of r.rows) {
      console.log(`  existing: ${row.indexname} => ${row.indexdef}`);
    }
  }
}

await client.end();
