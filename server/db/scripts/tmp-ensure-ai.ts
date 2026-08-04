import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();
await client.query("CREATE SCHEMA IF NOT EXISTS ai");
console.log("ensured ai schema");
await client.end();
