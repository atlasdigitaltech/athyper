import { Client } from 'pg';
const c=new Client({connectionString:'postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_neon'});
await c.connect();
const q = await c.query(`
SELECT
  tc.table_schema, tc.table_name, ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, kcu.column_name, ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema AND tc.table_name=kcu.table_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema AND ccu.table_name=tc.table_name
WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='accounting_profile' AND ccu.table_schema='master';`);
console.log('fks referencing accounting_profile', q.rows);
await c.end();
