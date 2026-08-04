import { Client } from 'pg';
import fs from 'node:fs';

const sql = fs.readFileSync('server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql','utf8');
const re = /INSERT\s+INTO\s+([\w\.]+)[\s\S]*?ON\s+CONFLICT\s*\(([^)]*)\)\s*DO\b/gi;
const entries=[];
let m;
while((m=re.exec(sql))!==null){
  entries.push({table:m[1].toLowerCase(), cols:m[2].toLowerCase().replace(/\s+/g,' ').trim().split(',').map(s=>s.trim())});
}

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL});
await client.connect();

for (const e of entries){
  const [schema, table] = e.table.includes('.') ? e.table.split('.') : ['master', e.table];
  const rows = (await client.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=$2",
    [schema, table]
  )).rows;

  const matched = rows.some((r) => {
    const def = r.indexdef.toLowerCase();
    const cols = e.cols.map((c) => c.replace(/^[a-z_]+\./,'')).join(', ');
    return def.includes(`(${cols})`);
  });

  if (!matched) {
    console.log(`NO MATCH: ${e.table} ON CONFLICT (${e.cols.join(',')})`);
    for (const r of rows) {
      console.log(`  ${r.indexname}: ${r.indexdef}`);
    }
  }
}

await client.end();
