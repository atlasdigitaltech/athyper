import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL! });
await c.connect();
await c.query('DROP SCHEMA IF EXISTS ai CASCADE');
await c.end();
console.log('dropped ai');
