const { Client } = require('pg');
(async()=>{
  const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await c.connect();
  const t = await c.query(`
    SELECT n.nspname AS schema, t.typname AS type_name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname='master' AND t.typname='principal_type_d';
  `);
  console.log(t.rows);

  const ct = await c.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema='master' AND table_name='principal'
    LIMIT 5;
  `);
  console.log('principal table rows:', ct.rows);
  await c.end();
})();
