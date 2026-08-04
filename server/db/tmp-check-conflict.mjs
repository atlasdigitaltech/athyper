import fs from 'node:fs';
import { Client } from 'pg';

const sql = fs.readFileSync('server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql', 'utf8');
const inserts = [];
const re = /INSERT\s+INTO\s+([\w\.]+)[\s\S]*?ON\s+CONFLICT\s*\(([^)]*)\)\s*DO\b/gi;
let m;
while ((m = re.exec(sql)) !== null) {
  inserts.push({ table: m[1], cols: m[2].replace(/\s+/g, ' ').trim(), idx: m.index });
}
const reBare = /INSERT\s+INTO\s+([\w\.]+)[\s\S]*?ON\s+CONFLICT\s+DO\s+NOTHING/gi;
while ((m = reBare.exec(sql)) !== null) {
  inserts.push({ table: m[1], cols: '<BASIC>', idx: m.index });
}

const norm = (s) => s.split(',').map(x => x.trim().toLowerCase().replace(/\b[a-z_]+\./g, '')).filter(Boolean);

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

for (const i of inserts) {
  if (i.cols === '<BASIC>') {
    console.log(`${i.table} => bare ON CONFLICT DO NOTHING`);
    continue;
  }
  const [schema, table] = i.table.split('.');
  const cols = norm(i.cols);
  const idxRows = await client.query(`
      SELECT i.indisunique,
             array_agg(a.attname ORDER BY k.ord) AS cols
      FROM pg_index i
      JOIN pg_class cl ON cl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
     WHERE n.nspname=$1
       AND cl.relname=$2
       AND i.indisunique
     GROUP BY i.indexrelid, i.indisunique, i.indpred
  `, [schema, table]);

  const colsMatch = idxRows.rows.some((r) => {
    const idxCols = Array.isArray(r.cols) ? r.cols : [];
    return idxCols.length === cols.length && norm(idxCols.join(',')).every((c, ix) => c === cols[ix]);
  });

  if (colsMatch) {
    console.log(`${i.table} ON CONFLICT (${i.cols}) => MATCH`);
    continue;
  }

    console.log(`${i.table} ON CONFLICT (${i.cols}) => MISMATCH`);
    for (const r of idxRows.rows) {
      const idxCols = Array.isArray(r.cols) ? r.cols : [];
      console.log(`   idx cols: ${idxCols.join(', ')} unique=${r.indisunique}`);
    }
}

await client.end();
