const fs = require('fs');
const {Client} = require('pg');
const sql = fs.readFileSync('server/db/seed/tenants/neon/020_technostat/003_technostat_production_seed.sql','utf8');
const inserts=[];
const re=/INSERT\s+INTO\s+([\w\.]+)[\s\S]*?ON\s+CONFLICT\s*\(([^)]*)\)\s*DO\b/gi;
let m;
while((m=re.exec(sql))!==null){
  inserts.push({table:m[1], cols:m[2].replace(/\s+/g,' ').trim(), idx:m.index});
}
// also catch bare ON CONFLICT DO NOTHING with comment target no inference
const reBare=/INSERT\s+INTO\s+([\w\.]+)[\s\S]*?ON\s+CONFLICT\s+DO\s+NOTHING/gi;
while((m=reBare.exec(sql))!==null){
  inserts.push({table:m[1], cols:'<BASIC>', idx:m.index});
}
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_ADMIN_URL});
  await c.connect();
  for (const i of inserts){
    const schema=i.table.split('.')[0];
    const table=i.table.split('.')[1];
    const cols=i.cols=== '<BASIC>' ? null : i.cols.split(',').map(s=>s.trim().replace(/\b[a-z_]+\./i,''));
    if(!cols || cols.includes('<BASIC>')){
      console.log(i.table,'=> bare ON CONFLICT DO NOTHING (requires any unique index)');
      continue;
    }
    const uq=await c.query(`
      SELECT conname, conkey, contype, conindid, i.indrelid::regclass::text AS table_name, i.indisunique
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      LEFT JOIN pg_index i ON i.indexrelid = c.conindid
      WHERE c.contype IN ('u','p')
      AND cl.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname=$1)
      AND cl.relname=$2
    `,[schema,table]);
    // quick check: verify any unique index contains all cols in same order/len
    const colsNorm=cols;
    let found=false;
    for(const r of uq.rows){
      const keyIdx=await c.query(`SELECT array_agg(attname ORDER BY ordinality) AS keys FROM (SELECT attname, unnest(indkey) WITH ORDINALITY FROM pg_index i CROSS JOIN UNNEST(i.indkey) WITH ORDINALITY x(attnum, ordinality) WHERE i.indexrelid = $1::oid) s(attnum, ordinality) JOIN pg_attribute a ON a.attrelid = (SELECT oid FROM pg_class WHERE relname=$2 AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname=$3)) AND a.attnum=s.attnum`, [r.conindid, table, schema]);
    }
    // simpler: check table constraints via catalog using pg_get_constraintdef for direct textual includes
    const list = (await c.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid=c.conrelid
      WHERE contype IN ('u')
        AND cl.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname=$1)
        AND cl.relname=$2`, [schema,table])).rows;
    let ok=false;
    for(const r of list){
      const allcols=list;
    }
    const sqlDef=(await c.query(`
      SELECT pg_get_expr(indpred, indrelid) AS pred, idx.indexrelid::regclass AS idxname, i.indrelid::regclass AS t,
             array_agg(a.attname ORDER BY k.ord) AS cols
      FROM pg_index i
      JOIN pg_class idxc ON idxc.oid=i.indexrelid
      JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum,ord) ON true
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
      WHERE i.indrelid = ($1::text)::regclass
        AND i.indisunique
      GROUP BY idxc.oid,i.indrelid,pred
      `,[`${schema}.${table}`])).rows;
    let has=false;
    for(const r of sqlDef){
      const existing=r.cols;
      if(existing.length===colsNorm.length && existing.every((c,ii)=>c===colsNorm[ii])){has=true; break;}
    }
    console.log(`${i.table} ON CONFLICT (${i.cols}) => ${has?'MATCH':'NO EXACT MATCH'}`);
    if(!has){
      for(const r of sqlDef){
        console.log('  existing:',r.cols.join(',')+(r.pred?` WHERE ${r.pred}`:''));
      }
    }
  }
  await c.end();
})();