const { Client } = require('pg');
(async()=>{
 const c=new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
 await c.connect();
 const rows=await c.query("SELECT id,code,realm_key,name,created_by,metadata->'_seed' as seed FROM master.tenant ORDER BY code");
 console.log(rows.rows);
 await c.end();
})();
