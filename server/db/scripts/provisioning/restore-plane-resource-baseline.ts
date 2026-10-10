#!/usr/bin/env tsx
import { Client } from "pg";
import { applyPlaneResourceBaseline } from "./authorization-pack-applicator.js";
import { loadProvisionInputs, planeOrder } from "./three-plane-model.js";
import type { ProvisionPlane } from "./safe-provision.js";
import { withAuthorizationProvisionTransaction } from "../../src/provisioning/authorization-transaction.js";

// Resource restoration is deliberately independent of clean-slate authorization
// seeding: an existing tenant's roles, denies and session bindings must survive.
const plane = process.argv
  .find((arg) => arg.startsWith("--plane="))
  ?.slice(8) as ProvisionPlane;
if (!planeOrder().includes(plane))
  throw new Error("--plane=studio|neon|mesh required");
const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
if (!process.env.DATABASE_ADMIN_URL)
  throw new Error("DATABASE_ADMIN_URL required");
const inputs = await loadProvisionInputs();
const rehearsalComplete = new Error("Resource restoration rehearsal completed");
await client.connect();
try {
  await withAuthorizationProvisionTransaction(client, plane, async () => {
    // Compare every authorization table, including MFA, denies and memberships.
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='authz' ORDER BY tablename",
    );
    const snapshot = async () => {
      const values = [];
      for (const { tablename } of tables.rows) {
        if (tablename === "scope_target") continue; // Business resource scope topology.
        const identifier = '"' + tablename.replaceAll('"', '""') + '"';
        values.push(
          (
            await client.query(
              `SELECT coalesce(jsonb_agg(row ORDER BY row::text),'[]'::jsonb)::text AS value FROM (SELECT to_jsonb(t) AS row FROM authz.${identifier} t) s`,
            )
          ).rows[0].value,
        );
      }
      return JSON.stringify(values);
    };
    const before = await snapshot();
    await applyPlaneResourceBaseline(client, inputs, plane);
    if ((await snapshot()) !== before)
      throw new Error(
        "Resource restoration changed authorization; rolling back",
      );
    if (!process.argv.includes("--apply")) throw rehearsalComplete;
  });
  console.log(
    JSON.stringify({
      plane,
      resources: "restored",
      authorization: "unchanged",
    }),
  );
} catch (error) {
  if (error !== rehearsalComplete) throw error;
  console.log(
    JSON.stringify({
      plane,
      resources: "rehearsed-and-rolled-back",
      authorization: "unchanged",
    }),
  );
} finally {
  await client.end();
}
