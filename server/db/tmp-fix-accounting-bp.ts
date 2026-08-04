import { Client } from 'pg';

const c = new Client({connectionString: 'postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_neon'});
await c.connect();
await c.query('BEGIN');
await c.query("SET CONSTRAINTS ALL DEFERRED");
await c.query('DROP TABLE IF EXISTS master.accounting_profile CASCADE');
await c.query('DROP TABLE IF EXISTS master.budget_profile CASCADE');
await c.query('DROP TABLE IF EXISTS master.budget_allocation CASCADE');
await c.query('COMMIT');
console.log('dropped budgeting legacy/new tables');
await c.end();
