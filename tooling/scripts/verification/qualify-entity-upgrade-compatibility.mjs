/** D7 assessment: captured inputs, fresh disposable foundations, actual forward runner. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, relative } from "node:path";
import { artifactDirectory } from "../artifact-paths.mjs";

assert.equal(
  process.argv.length,
  2,
  "No database target or other arguments are accepted",
);
const root = resolve(import.meta.dirname, "../../..");
const output = artifactDirectory("entity-upgrade-compatibility");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const matrixPath = "server/db/migrations/compatibility-baselines.json";
const matrix = JSON.parse(readFileSync(join(root, matrixPath), "utf8"));
assert.equal(matrix.schema, "entity-upgrade-compatibility-baselines/1");
const report = {
  schema: "entity-upgrade-compatibility-qualification/1",
  startedAt: new Date().toISOString(),
  passed: false,
  d7Complete: false,
  target: matrix.target,
  limitations: matrix.limitations,
  unresolved: matrix.baselines.filter((item) => item.kind === "unresolved"),
  paths: [],
};
mkdirSync(resolve(output, ".."), { recursive: true });
mkdirSync(output, { mode: 0o700 });
const source = join(output, "source");
const write = (path, value) => {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, value);
};
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 120_000,
  });
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
function execute(command, args, log) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16_000_000,
  });
  write(`${log}.stdout`, result.stdout ?? "");
  write(`${log}.stderr`, result.stderr ?? "");
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} exited ${result.status}: ${result.error?.message ?? result.stderr?.slice(-4000)}`,
    );
  return result.stdout;
}
try {
  for (const path of ["server/db/ddl", "server/db/migrations"])
    cpSync(join(root, path), join(source, path), { recursive: true });
  for (const path of [
    "server/db/runtime/run-forward-migrations.sh",
    "server/db/scripts/provisioning/foundation-runner.ts",
    "tooling/scripts/verification/qualify-entity-upgrade-compatibility.mjs",
    "tooling/scripts/artifact-paths.mjs",
    "package.json",
    "server/db/package.json",
    "pnpm-lock.yaml",
  ])
    write(join(source, path), readFileSync(join(root, path)));
  report.source = files(source)
    .sort()
    .map((path) => ({
      path: relative(source, path),
      sha256: hash(readFileSync(path)),
    }));
  report.sourceHash = hash(JSON.stringify(report.source));
  assert.deepEqual(
    JSON.parse(readFileSync(join(source, matrixPath), "utf8")),
    matrix,
  );
  write(
    join(output, "source-manifest.json"),
    JSON.stringify(report.source, null, 2) + "\n",
  );
  // The captured runner imports pg; resolve the installed dependency without copying it into source evidence.
  symlinkSync(
    join(root, "server/db/node_modules"),
    join(source, "server/db/node_modules"),
    "dir",
  );
  for (const baseline of matrix.baselines.filter(
    (item) => item.kind === "reconstructed",
  )) {
    const container = `athyper-upgrade-compatibility-${randomUUID()}`;
    const work = join(output, baseline.id);
    const pathReport = {
      baseline: baseline.id,
      kind: baseline.kind,
      planes: [],
      passed: false,
    };
    report.paths.push(pathReport);
    let created = false;
    const sql = (plane, input) =>
      docker(
        "exec",
        container,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        `athyper_${plane}`,
        "-v",
        "ON_ERROR_STOP=1",
        "-Atq",
        "-c",
        input,
      ).trim();
    const snapshot = (plane) =>
      Object.fromEntries(
        [
          "shared.country",
          "master.principal",
          "master.principal_profile",
          "master.principal_identity_binding",
        ].map((table) => [
          table,
          JSON.parse(
            sql(
              plane,
              `SELECT json_build_object('count',count(*),'sha256_input',coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) FROM ${table} t`,
            ),
          ),
        ]),
      );
    const ledger = (plane) =>
      JSON.parse(
        sql(
          plane,
          "SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY migration_name),'[]'::jsonb) FROM public.athyper_schema_migration_v1 m",
        ),
      );
    function equivalenceProbes(plane) {
      const validators = join(source, "server/db/migrations/equivalence");
      const history = readFileSync(
        join(validators, "20260928_record_history.sql"),
        "utf8",
      );
      const owner = readFileSync(
        join(validators, "20260929_entity_owner_access.sql"),
        "utf8",
      );
      const probes = [
        ["canonical history", "", history, true],
        ["canonical owner scope", "", owner, true],
        [
          "provisioning receipt drift",
          "UPDATE public.schema_provisions SET checksum=repeat('0',64) WHERE file_name='common/snapshot/12_record_history.sql';",
          history,
          false,
        ],
        [
          "history RLS disabled",
          "ALTER TABLE snapshot.record_version DISABLE ROW LEVEL SECURITY;",
          history,
          false,
        ],
        [
          "history mutation grant",
          "GRANT UPDATE ON snapshot.record_version TO athyperapp;",
          history,
          false,
        ],
        [
          "history immutability disabled",
          "ALTER TABLE snapshot.record_version DISABLE TRIGGER record_version_immutable;",
          history,
          false,
        ],
        [
          "history column default changed",
          "ALTER TABLE snapshot.record_version ALTER COLUMN occurred_at SET DEFAULT now();",
          history,
          false,
        ],
        [
          "owner version default changed",
          "ALTER TABLE master.principal_profile ALTER COLUMN record_version SET DEFAULT 2;",
          owner,
          false,
        ],
        [
          "owner permission changed",
          "UPDATE authz.permission SET status='suspended' WHERE canonical_code='common.identity.principal.read';",
          owner,
          false,
        ],
      ];
      if (plane === "studio") {
        const binding = readFileSync(
          join(validators, "20260926_entity_execution_binding_storage.sql"),
          "utf8",
        );
        const references = readFileSync(
          join(validators, "20261001_entity_key_reference_contract.sql"),
          "utf8",
        );
        const attempts = readFileSync(
          join(validators, "20261001_atlas_learning_attempts.sql"),
          "utf8",
        );
        probes.push(
          ["canonical execution bindings", "", binding, true],
          [
            "binding constraint removed",
            "ALTER TABLE metadata.entity_change_case_binding DROP CONSTRAINT entity_change_case_binding_operation_uq;",
            binding,
            false,
          ],
          ["canonical UUID reference superset", "", references, true],
          [
            "reference validator grant changed",
            "REVOKE ALL ON FUNCTION metadata.fn_entity_key_reference_valid(jsonb,text) FROM athyperadmin;",
            references,
            false,
          ],
          ["canonical attempt ledger", "", attempts, true],
          [
            "attempt evidence mutability",
            "ALTER TABLE ai.atlas_learning_attempt_result DISABLE TRIGGER atlas_learning_attempt_result_immutable;",
            attempts,
            false,
          ],
        );
      }
      // Recreate the history capability with the retained original SQL inside a
      // rolled-back transaction. Canonical foundations additionally grant their
      // existing administrator role access; preserve and explicitly test that superset.
      const original = readFileSync(
        join(source, "server/db/migrations/20260928_record_history.sql"),
        "utf8",
      ).replace(/^BEGIN;\s*|^COMMIT;\s*/gm, "");
      probes.push([
        "original history migration parity",
        "DROP TABLE snapshot.record_version; DROP FUNCTION snapshot.trg_record_version_immutable();\n" +
          original +
          "\nGRANT ALL ON snapshot.record_version TO athyperadmin; GRANT EXECUTE ON FUNCTION snapshot.trg_record_version_immutable() TO athyperadmin;",
        history,
        true,
      ]);
      const receipts = [];
      for (const [label, mutation, validator, expected] of probes) {
        const result = spawnSync(
          "docker",
          [
            "exec",
            "-i",
            container,
            "psql",
            "-X",
            "-U",
            "postgres",
            "-d",
            `athyper_${plane}`,
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            "-",
          ],
          {
            input: `BEGIN;\n${mutation}\n${validator}\nROLLBACK;\n`,
            encoding: "utf8",
            timeout: 30_000,
          },
        );
        write(
          join(work, `${plane}-equivalence-${receipts.length}.log`),
          (result.stdout ?? "") + (result.stderr ?? ""),
        );
        assert.equal(result.error, undefined, label);
        if (expected)
          assert.equal(result.status, 0, `${label}: ${result.stderr}`);
        else {
          assert.notEqual(result.status, 0, label);
          assert.match(
            result.stderr,
            /FOUNDATION_EQUIVALENCE_|Common identity catalog conflict/,
            label,
          );
        }
        receipts.push({ label, passed: true, expectedAcceptance: expected });
      }
      return receipts;
    }
    try {
      cpSync(join(source, "server/db/ddl"), join(work, "db/ddl"), {
        recursive: true,
      });
      cpSync(join(source, "server/db/migrations"), join(work, "migrations"), {
        recursive: true,
      });
      write(join(work, "migrations/password"), "disposable-test-only\n");
      for (const plane of matrix.planes) {
        const manifest = join(work, `db/ddl/planes/${plane}/_manifest.txt`);
        write(
          manifest,
          readFileSync(manifest, "utf8")
            .split(/\r?\n/u)
            .filter((line) => !baseline.excludedDdl.includes(line.trim()))
            .join("\n"),
        );
      }
      docker(
        "run",
        "-d",
        "--name",
        container,
        "--network",
        "none",
        "--tmpfs",
        "/var/lib/postgresql/data",
        "--label",
        "athyper.purpose=entity-upgrade-compatibility",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "-v",
        `${join(work, "migrations")}:/app/migrations:ro`,
        "-v",
        `${join(source, "server/db/runtime/run-forward-migrations.sh")}:/runner.sh:ro`,
        "postgres:16.15-bookworm",
      );
      created = true;
      pathReport.imageId = docker(
        "inspect",
        "--format",
        "{{.Image}}",
        container,
      ).trim();
      for (let attempt = 0; ; attempt++) {
        try {
          docker(
            "exec",
            container,
            "psql",
            "-X",
            "-U",
            "postgres",
            "-Atqc",
            "SELECT 1",
          );
          break;
        } catch (error) {
          if (attempt >= 60) throw error;
          await new Promise((done) => setTimeout(done, 250));
        }
      }
      for (const plane of matrix.planes) {
        console.log(`Installing captured ${baseline.id} ${plane} foundation`);
        const outcome = { plane, passed: false, phase: "foundation" };
        pathReport.planes.push(outcome);
        try {
          outcome.foundation = JSON.parse(
            execute(
              "pnpm",
              [
                "--filter",
                "@athyper/server-db",
                "exec",
                "tsx",
                join(
                  source,
                  "server/db/scripts/provisioning/foundation-runner.ts",
                ),
                `--plane=${plane}`,
                `--container=${container}`,
                `--ddl-root=${join(work, "db/ddl")}`,
              ],
              join(work, `${plane}-foundation`),
            ),
          ).results[0];
          outcome.phase = "installed";
        } catch (error) {
          outcome.failure = error.message;
        }
      }
      for (const outcome of pathReport.planes) {
        if (outcome.phase !== "installed") continue;
        const { plane } = outcome;
        console.log(
          `Qualifying captured ${baseline.id} ${plane} forward upgrades`,
        );
        try {
          const before = snapshot(plane);
          assert.ok(
            before["shared.country"].count > 0,
            "Country preservation must exercise populated rows",
          );
          assert.ok(
            before["master.principal"].count > 0,
            "Principal preservation must exercise populated rows",
          );
          outcome.before = Object.fromEntries(
            Object.entries(before).map(([table, rows]) => [
              table,
              { count: rows.count, sha256: hash(rows.sha256_input) },
            ]),
          );
          outcome.equivalenceProbes = equivalenceProbes(plane);
          outcome.phase = "forward-upgrade";
          // Exercise each plane independently; a Studio failure must not hide Neon/Mesh outcomes.
          for (const target of matrix.planes)
            write(
              join(work, `migrations/manifests/${target}.txt`),
              target === plane
                ? readFileSync(
                    join(
                      source,
                      `server/db/migrations/manifests/${target}.txt`,
                    ),
                  )
                : "",
            );
          const runnerArgs = [
            "exec",
            "-e",
            "PGHOST=127.0.0.1",
            "-e",
            "ATHYPER_POSTGRES_PASSWORD_FILE=/app/migrations/password",
            container,
            "sh",
            "/runner.sh",
          ];
          execute("docker", runnerArgs, join(work, `${plane}-forward`));
          assert.deepEqual(
            snapshot(plane),
            before,
            "Populated reference and identity rows changed",
          );
          outcome.migrationReceipts = ledger(plane);
          const expected = readFileSync(
            join(source, `server/db/migrations/manifests/${plane}.txt`),
            "utf8",
          )
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"));
          assert.equal(outcome.migrationReceipts.length, expected.length);
          for (const name of expected) {
            const receipt = outcome.migrationReceipts.find(
              (item) => item.migration_name === name,
            );
            assert.equal(receipt?.status, "applied");
            assert.equal(
              receipt.sha256,
              hash(readFileSync(join(source, "server/db/migrations", name))),
            );
          }
          outcome.phase = "exact-retry";
          execute("docker", runnerArgs, join(work, `${plane}-retry`));
          assert.deepEqual(
            ledger(plane),
            outcome.migrationReceipts,
            "Retry rewrote migration receipts",
          );
          assert.deepEqual(
            snapshot(plane),
            before,
            "Retry changed preserved rows",
          );
          outcome.phase = "passed";
          outcome.passed = true;
        } catch (error) {
          outcome.failure = error.message;
          try {
            outcome.migrationReceipts = ledger(plane);
          } catch {
            /* Foundation may not have installed a ledger. */
          }
        }
      }
      pathReport.passed =
        pathReport.planes.length === matrix.planes.length &&
        pathReport.planes.every((item) => item.passed);
    } catch (error) {
      pathReport.failure = error.message;
    } finally {
      if (created) docker("rm", "-f", container);
    }
  }
  report.passed =
    report.paths.length > 0 && report.paths.every((item) => item.passed);
  // Never promote reconstructed fixtures to historical/deployment qualification.
  report.d7Complete = false;
} catch (error) {
  report.failure = error.message;
} finally {
  // Remove only dependency resolution links; retain all captured SQL and logs, including failed attempts.
  rmSync(join(source, "server/db/node_modules"), { force: true });
  report.completedAt = new Date().toISOString();
  write(
    join(output, "qualification.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      d7Complete: report.d7Complete,
      output,
      paths: report.paths.map((item) => ({
        baseline: item.baseline,
        passed: item.passed,
        planes: item.planes.map(({ plane, passed, phase }) => ({
          plane,
          passed,
          phase,
        })),
      })),
      failure: report.failure,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
