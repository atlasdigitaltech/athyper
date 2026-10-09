/**
 * Installs the local DEV consolidation of the approved compiled-Entity source
 * reader. It changes no entity, release, artifact, policy, or deployment data.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { Client } = createRequire(
  new URL("../../../package.json", import.meta.url),
)("pg");
const apply =
  process.argv[2] === "--apply=DEV-COMPILED-ENTITY-SOURCE-V4-CLEANUP";
assert.ok(
  process.argv.length === 2 || (apply && process.argv.length === 3),
  "Expected optional --apply=DEV-COMPILED-ENTITY-SOURCE-V4-CLEANUP",
);

const container = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
assert.equal(
  container.Config.Labels["com.docker.compose.project"],
  "athyper-dev",
);
assert.equal(container.State.Running, true);
const environment = Object.fromEntries(
  container.Config.Env.map((entry) => {
    const separator = entry.indexOf("=");
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }),
);
const passwordFile = container.Mounts.find(
  (mount) => mount.Destination === environment.POSTGRES_PASSWORD_FILE,
)?.Source;
assert.ok(passwordFile?.includes("/.athyper/instances/dev/secrets/"));

const migrationName = "20261010_compiled_entity_source_v4_cleanup.sql";
const migration = readFileSync(`server/db/migrations/${migrationName}`, "utf8");
const hash = createHash("sha256").update(migration).digest("hex");
const inventory = JSON.parse(
  readFileSync("server/db/migrations/inventory.json", "utf8"),
);
assert.equal(
  inventory.entries.find(
    (entry) => entry.path === `migrations/${migrationName}`,
  )?.sha256,
  hash,
);
assert.ok(
  readFileSync(
    "server/db/migrations/manifests/runner-transactions.sha256",
    "utf8",
  ).includes(`${hash}  ${migrationName}`),
);

const database = new Client({
  host: Object.values(container.NetworkSettings.Networks)[0].IPAddress,
  user: environment.POSTGRES_USER,
  password: readFileSync(passwordFile, "utf8").trim(),
  database: "athyper_studio",
});
const report = {
  schema: "athyper.compiled-entity-source-v4-cleanup/1",
  environment: "dev",
  migration: migrationName,
  sha256: hash,
  applied: false,
};

async function readerState() {
  const result = await database.query(`SELECT
    to_regprocedure('publication.fn_compiled_entity_compilation_source(uuid)') IS NOT NULL AS v1,
    to_regprocedure('publication.fn_compiled_entity_compilation_source_v2(uuid)') IS NOT NULL AS v2,
    to_regprocedure('publication.fn_compiled_entity_compilation_source_v3(uuid)') IS NOT NULL AS v3,
    to_regprocedure('publication.fn_compiled_entity_compilation_source_v4(uuid)') IS NOT NULL AS v4`);
  return result.rows[0];
}

async function assertV4Available() {
  const releases = (
    await database.query(`SELECT DISTINCT pr.id, pr.tenant_id
      FROM publication.release pr
      JOIN publication.entity_release_link link ON link.publication_release_id = pr.id
      JOIN metadata.entity_release er ON er.id = link.entity_release_id
      WHERE pr.metadata->>'artifactKind' = 'compiled_entity_runtime'
        AND pr.status IN ('approved', 'published')
        AND pr.tenant_id IS NOT NULL
      ORDER BY pr.id DESC LIMIT 2`)
  ).rows;
  assert.ok(
    releases.length > 0,
    "No approved local compiled-Entity release is available for a source-reader check",
  );
  for (const release of releases) {
    await database.query(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      [release.tenant_id],
    );
    await database.query("SET LOCAL ROLE athyper_publication_service");
    const result = await database.query(
      "SELECT count(*)::int AS count FROM publication.fn_compiled_entity_compilation_source_v4($1::uuid)",
      [release.id],
    );
    assert.ok(
      result.rows[0].count > 0,
      `v4 returned no approved source for ${release.id}`,
    );
    await database.query("RESET ROLE");
  }
}

await database.connect();
try {
  const before = await readerState();
  const prior = (
    await database.query(
      "SELECT sha256, status FROM public.athyper_schema_migration_v1 WHERE migration_name = $1",
      [migrationName],
    )
  ).rows[0];
  if (before.v4) {
    assert.deepEqual(before, { v1: false, v2: false, v3: false, v4: true });
    assert.ok(prior, "Installed v4 requires its migration-ledger row");
    assert.equal(prior.sha256, hash);
    assert.equal(prior.status, "applied");
    await database.query("BEGIN");
    await assertV4Available();
    await database.query("ROLLBACK");
    report.alreadyInstalled = true;
    report.sourceReaderPassed = true;
  } else {
    assert.equal(
      before.v1 && before.v2 && before.v3,
      true,
      "Expected the complete legacy source-reader chain",
    );
    await database.query("BEGIN");
    await database.query(
      "SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '15000ms'",
    );
    await database.query(migration);
    const rehearsed = await readerState();
    assert.deepEqual(rehearsed, { v1: false, v2: false, v3: false, v4: true });
    await assertV4Available();
    await database.query("ROLLBACK");
    report.rollbackAndSourceReaderPassed = true;
  }

  if (apply) {
    await database.query("BEGIN");
    await database.query(
      "SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '15000ms'",
    );
    await database.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [migrationName],
    );
    if (prior) {
      assert.equal(prior.sha256, hash);
      assert.equal(prior.status, "applied");
    } else {
      await database.query(migration);
      await database.query(
        `INSERT INTO public.athyper_schema_migration_v1
          (migration_name, sha256, status, runner_id, started_at, completed_at)
         VALUES ($1, $2, 'applied', $3, transaction_timestamp(), clock_timestamp())`,
        [
          migrationName,
          hash,
          `compiled-entity-source-v4-cleanup-${randomUUID()}`,
        ],
      );
    }
    await assertV4Available();
    await database.query("COMMIT");
    report.applied = true;
    report.reused = Boolean(prior);
  }
  report.passed = true;
} catch (error) {
  await database.query("ROLLBACK");
  report.passed = false;
  report.error = { code: error.code, message: error.message };
  process.exitCode = 1;
} finally {
  await database.end();
  console.log(JSON.stringify(report));
}
