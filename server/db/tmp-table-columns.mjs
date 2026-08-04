import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

const lookup = await client.query(
  "SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='control' AND table_name='lookup_value' ORDER BY ordinal_position"
);
console.log('control.lookup_value');
for (const row of lookup.rows) console.log(`${row.column_name}: ${row.data_type}`);

const agr = await client.query(
  "SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='master' AND table_name='auth_group_role' ORDER BY ordinal_position"
);
console.log('\nmaster.auth_group_role');
for (const row of agr.rows) console.log(`${row.column_name}: ${row.data_type}`);

const taxrate = await client.query(
  "SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='control' AND table_name='tax_rate_schedule' ORDER BY ordinal_position"
);
console.log('\ncontrol.tax_rate_schedule');
for (const row of taxrate.rows) console.log(`${row.column_name}: ${row.data_type}`);

await client.end();
