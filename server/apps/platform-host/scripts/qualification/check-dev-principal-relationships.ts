#!/usr/bin/env tsx
/** Read-only FK/unique-key qualification against deployed dependency contracts. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import {
  compileTableEntityProduct,
  parseTableEntityProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { qualifyPublishedRelationships } from "../../src/composition/shared/publication/relationship-qualification.js";

const inspected = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
if (
  inspected.Config.Labels["com.docker.compose.project"] !== "athyper-dev" ||
  !inspected.State.Running
)
  throw Error("Running DEV database required");
const env = Object.fromEntries(
  inspected.Config.Env.map((entry: string) => {
    const i = entry.indexOf("=");
    return [entry.slice(0, i), entry.slice(i + 1)];
  }),
);
const secret = inspected.Mounts.find(
  (mount: { Destination: string }) =>
    mount.Destination === env.POSTGRES_PASSWORD_FILE,
)?.Source;
if (
  typeof secret !== "string" ||
  !secret.includes("/.athyper/instances/dev/secrets/")
)
  throw Error("DEV credential mount required");
const network = Object.values(inspected.NetworkSettings.Networks)[0] as {
  IPAddress: string;
};
for (const plane of ["neon", "studio", "mesh"] as const) {
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: network.IPAddress,
        database: `athyper_${plane}`,
        user: env.POSTGRES_USER,
        password: readFileSync(secret, "utf8").trim(),
        max: 1,
      }),
    }),
  });
  try {
    for (const entity of ["principal_ui_profile"]) {
      const candidate = compileTableEntityProduct(
        parseTableEntityProduct(
          JSON.parse(
            readFileSync(
              `metadata/entities/${entity}/definition.json`,
              "utf8",
            ),
          ),
        ),
        plane,
      );
      await db
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (tx) => {
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
          await sql`SET LOCAL statement_timeout='5000ms'`.execute(tx);
          await qualifyPublishedRelationships(candidate.graph, tx);
        });
      console.log(
        JSON.stringify({
          entity,
          plane,
          relationshipQualification: "passed",
          published: false,
        }),
      );
    }
  } finally {
    await db.destroy();
  }
}
