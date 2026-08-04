import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Client } from 'pg';

const filePath = 'server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql';
const sql = fs.readFileSync(filePath, 'utf8');

const re = /INSERT\s+INTO\s+([\w\.]+)[\s\S]*?ON\s+CONFLICT\s*\(([^)]*)\)\s*DO\b/gi;
const pairs = new Map();
let m;
while ((m = re.exec(sql)) !== null) {
  const table = m[1];
  const cols = m[2]
    .replace(/\s+/g, ' ')
    .trim()
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (table.includes('tmp_') || table.startsWith('control.tax_jurisdiction')) {
    continue;
  }
  const key = `${table}|${cols.join(',')}`;
  pairs.set(key, { table, cols });
}

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

for (const { table, cols } of pairs.values()) {
  const [schema, rel] = table.split('.');
  const idxName = `seed_compat_${createHash('md5').update(`${table}|${cols.join('|')}`).digest('hex').slice(0, 20)}`;
  const quotedCols = cols.map((c) => `${c}`).join(', ');
  const createSql = `CREATE UNIQUE INDEX ${idxName} ON ${table} (${quotedCols});`;
  try {
    await client.query(createSql);
    console.log(`created ${idxName} on ${table} (${quotedCols})`);
  } catch (e) {
    if (String(e.message).includes('already exists')) {
      console.log(`exists ${idxName} on ${table}`);
    } else if (String(e.message).includes('duplicate key value')) {
      console.log(`duplicate keys prevent unique index ${idxName} on ${table}`);
    } else if (String(e.message).includes('does not exist')) {
      console.log(`table/column missing for ${table}`);
    } else {
      console.log(`failed ${idxName} on ${table}: ${e.message}`);
    }
  }
}

await client.end();
