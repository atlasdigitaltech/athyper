/** Read-only DEV diagnostic. Never allocates, enrolls, grants or approves. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { inspectLegacyEnrollmentEvidence } from "../../../server/packages/planes/studio/meta-entity-authoring/src/legacy-enrollment-evidence.js";
const args = process.argv.slice(2);
assert.equal(
  args[0],
  "--output",
  "Use --output PATH followed by exact draft UUIDs",
);
const output = args[1],
  ids = args.slice(2);
assert.ok(
  output &&
    ids.length > 0 &&
    ids.length <= 20 &&
    new Set(ids).size === ids.length,
);
for (const id of ids)
  assert.match(
    id,
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  );
const container = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
const env = new Map<string, string>(
  (container.Config.Env as string[]).map((v) => {
    const i = v.indexOf("=");
    return [v.slice(0, i), v.slice(i + 1)];
  }),
);
const addresses = Object.values(container.NetworkSettings.Networks)
  .map((n: any) => n.IPAddress)
  .filter(Boolean);
assert.equal(
  addresses.length,
  1,
  "Select a verified DEV database network before inspection",
);
const { Pool } = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
)("pg");
const { Kysely, PostgresDialect, sql } = createRequire(
  new URL(
    "../../../server/packages/planes/studio/meta-entity-authoring/package.json",
    import.meta.url,
  ),
)("kysely");
const password =
  env.get("POSTGRES_PASSWORD") ??
  (env.get("POSTGRES_PASSWORD_FILE")
    ? execFileSync(
        "docker",
        ["exec", "athyper-dev-db-1", "cat", env.get("POSTGRES_PASSWORD_FILE")!],
        { encoding: "utf8" },
      ).trimEnd()
    : undefined);
assert.ok(
  typeof password === "string" && password.length > 0,
  "DEV database credential unavailable",
);
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: addresses[0],
      port: 5432,
      database: "athyper_studio",
      user: env.get("POSTGRES_USER") ?? "postgres",
      password,
      max: 1,
      connectionTimeoutMillis: 5000,
    }),
  }),
});
try {
  const report = await db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx: any) => {
      await sql.raw("SET TRANSACTION READ ONLY").execute(tx);
      await sql.raw("SET LOCAL statement_timeout='30s'").execute(tx);
      const sources = [];
      for (const id of ids)
        sources.push(
          await inspectLegacyEnrollmentEvidence(tx, id, {
            maximumBytes: 32 * 1024 * 1024,
            maximumHistoryRows: 1000,
          }),
        );
      return {
        observedAt: new Date().toISOString(),
        database: "athyper_studio",
        execution: "privileged-read-only-diagnostic",
        sources,
        productWriteAuthority: "not-established",
        hostApproval: "not-established",
        deployedF6F8F9: "not-established",
      };
    });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(
    JSON.stringify(
      {
        output,
        sources: report.sources.map((r: any) => ({
          changeSetId: r.changeSetId,
          sourceHash: r.sourceHash,
          blockers: r.blockers,
          history: r.history,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await db.destroy();
}
