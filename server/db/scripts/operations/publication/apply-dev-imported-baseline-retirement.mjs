import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Local DEV only. Normal environment upgrades use the registered migration.
const { Client } = createRequire(
  new URL("../../../package.json", import.meta.url),
)("pg");
const apply = process.argv[2] === "--apply";
assert.ok(process.argv.length === 2 || (apply && process.argv.length === 3));
const container = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
assert.equal(
  container.Config.Labels["com.docker.compose.project"],
  "athyper-dev",
);
assert.equal(container.State.Running, true);
const env = Object.fromEntries(
  container.Config.Env.map((item) => {
    const index = item.indexOf("=");
    return [item.slice(0, index), item.slice(index + 1)];
  }),
);
const secret = container.Mounts.find(
  (mount) => mount.Destination === env.POSTGRES_PASSWORD_FILE,
)?.Source;
assert.ok(secret?.includes("/.athyper/instances/dev/secrets/"));
const name = "20261010_imported_baseline_retirement.sql";
const migration = readFileSync(
  new URL(`../../../migrations/${name}`, import.meta.url),
  "utf8",
);
const hash = createHash("sha256").update(migration).digest("hex");
const inventory = JSON.parse(
  readFileSync(
    new URL("../../../migrations/inventory.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(
  inventory.entries.find((entry) => entry.path === `migrations/${name}`)
    ?.sha256,
  hash,
);
const db = new Client({
  host: Object.values(container.NetworkSettings.Networks)[0].IPAddress,
  database: "athyper_studio",
  user: env.POSTGRES_USER,
  password: readFileSync(secret, "utf8").trim(),
});
await db.connect();
try {
  await db.query(
    "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'",
  );
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    name,
  ]);
  const prior = (
    await db.query(
      "SELECT sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name=$1",
      [name],
    )
  ).rows[0];
  if (prior) {
    assert.equal(prior.sha256, hash);
    assert.equal(prior.status, "applied");
  }
  // The SQL is repeatable and refuses any populated retirement table.
  await db.query(migration);
  if (!prior)
    await db.query(
      "INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES($1,$2,'applied',$3,transaction_timestamp(),clock_timestamp())",
      [name, hash, `imported-baseline-retirement-${randomUUID()}`],
    );
  await db.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(
    JSON.stringify({
      migration: name,
      sha256: hash,
      applied: apply,
      replay: Boolean(prior),
      rehearsed: !apply,
    }),
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
