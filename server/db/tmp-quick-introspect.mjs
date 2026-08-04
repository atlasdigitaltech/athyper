import { Client } from "pg";

const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

const tables = await c.query(`
select table_schema, table_name
from information_schema.tables
where table_schema='master'
  and table_name in ('tenant','tenant_profile','lookup_value','auth_group_role');
`);
console.log("TABLES:");
console.log(JSON.stringify(tables.rows, null, 2));

const cols = await c.query(`
select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema='master'
  and table_name = 'tenant'
  and column_name in ('tenant_type','region','subscription','code','realm_key','id');
`);
console.log("TENANT COLUMNS:");
console.log(JSON.stringify(cols.rows, null, 2));

await c.end();
