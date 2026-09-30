#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
const input = process.argv[2];
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!input || input.startsWith("-") || !input.endsWith(".sql")) throw new Error("one SQL file path is required");
const file = resolve(process.cwd(), input);
const source = (await readFile(file, "utf8")).replace(/^\\set\s+ON_ERROR_STOP\s+on\s*$/gmu, "");
if (/^\\/mu.test(source)) throw new Error(`${file} contains unsupported psql meta-commands`);

const client = new Client({ connectionString: databaseUrl, application_name: "athyper-sql-integration-test" });
await client.connect();
try {
  await client.query(source);
  console.log(`SQL_INTEGRATION_OK ${input}`);
} finally {
  await client.end();
}
