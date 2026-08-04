const { Client } = require('pg');
(async()=>{
 const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
 await c.connect();
 const tid='019fc8bc-ecac-7a4a-8d31-ab63d8560986';
 const r = await c.query('SELECT id,code,name,principal_type,status,created_by,metadata FROM master.principal WHERE tenant_id=$1 ORDER BY code', [tid]);
 console.log(r.rows);
 const b = await c.query('SELECT * FROM master.principal_profile LIMIT 5');
 console.log('profiles', b.rows.length);
 await c.end();
})();
