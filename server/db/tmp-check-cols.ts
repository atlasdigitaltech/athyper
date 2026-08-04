import { Client } from 'pg';
const c=new Client({connectionString:'postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_neon'});
await c.connect();
const d=await c.query(`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema='master' AND table_name='tenant' ORDER BY ordinal_position`);
console.log(d.rows);
await c.end();
