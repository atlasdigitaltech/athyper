const { Client } = require('pg');
(async()=>{
  const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await c.connect();
  const t = await c.query("SELECT id FROM master.tenant WHERE realm_key='athyper' AND code='technostat'");
  const tid = t.rows[0]?.id;
  const r = await c.query(`SELECT p.code,p.id, pp.id as profile_id, pp.metadata as profile_metadata
    FROM master.principal p
    LEFT JOIN master.principal_profile pp ON pp.principal_id = p.id
    WHERE p.tenant_id=$1 AND p.code LIKE '%admin' OR p.code='tksa.owner'
    ORDER BY p.code`, [tid]);
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})();
