#!/usr/bin/env tsx

import pg from "pg";

const plane = process.argv.find((arg) => arg.startsWith("--plane="))
  ?.slice("--plane=".length);
if (plane !== "neon" && plane !== "mesh") {
  throw new Error("--plane=neon|mesh is required");
}
const connectionString = process.env[
  plane === "mesh" ? "MESH_DATABASE_URL" : "DATABASE_URL"
];
if (!connectionString) throw new Error("plane database URL is required");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const result = await client.query(`
    SELECT build_id, command_tag, object_type, object_identity, observed_at
    FROM wave9_guard.create_observation
    WHERE plane = $1
    ORDER BY id
  `, [plane]);
  process.stdout.write(`${JSON.stringify(result.rows, null, 2)}\n`);
} finally {
  await client.end();
}
