import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, createHash } from "node:crypto";

test(
  "forward migrations roll back unwrapped SQL, retain checksums and refuse failed replays",
  {
    skip: process.env.ATHYPER_FORWARD_MIGRATION_TESTS !== "true",
    timeout: 120000,
  },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "athyper-forward-"));
    const name = `athyper-forward-${randomBytes(6).toString("hex")}`;
    const migration = "20260913_reference_choice_recent.sql";
    const source = readFileSync(
      resolve(
        "server/db/scripts/operations/upgrades/legacy-baseline-20260914",
        migration,
      ),
    );
    const checksum = createHash("sha256").update(source).digest("hex");
    const password = randomBytes(24).toString("hex");
    const planes = ["studio", "neon", "mesh"];
    const command = (...args) =>
      spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
    const docker = (...args) => {
      const result = command(...args);
      assert.equal(
        result.status,
        0,
        (result.stderr ?? "").replaceAll(password, "[redacted]"),
      );
      return result.stdout.trim();
    };
    const sql = (plane, query) =>
      docker(
        "exec",
        name,
        "psql",
        "-U",
        "postgres",
        "-d",
        `athyper_${plane}`,
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        query,
      );
    const run = () =>
      command(
        "exec",
        "-e",
        "PGHOST=127.0.0.1",
        "-e",
        "ATHYPER_MIGRATION_ROOT=/fixture/migrations",
        "-e",
        "ATHYPER_POSTGRES_PASSWORD_FILE=/fixture/password",
        name,
        "sh",
        "/fixture/runner.sh",
      );
    try {
      mkdirSync(join(root, "migrations/manifests"), { recursive: true });
      writeFileSync(join(root, "password"), password, { mode: 0o600 });
      copyFileSync(
        resolve("server/db/runtime/run-forward-migrations.sh"),
        join(root, "runner.sh"),
      );
      copyFileSync(
        resolve("server/db/migrations/manifests/runner-transactions.sha256"),
        join(root, "migrations/manifests/runner-transactions.sha256"),
      );
      // The real upgrade is retained as a legacy fixture; only this disposable
      // runner manifest includes it. Preserve its transaction-wrapper checksum.
      const transactionManifest = join(
        root,
        "migrations/manifests/runner-transactions.sha256",
      );
      writeFileSync(
        transactionManifest,
        readFileSync(transactionManifest, "utf8") +
          `${checksum}  ${migration}\n`,
      );
      writeFileSync(join(root, "migrations", migration), source);
      writeFileSync(
        join(root, "migrations/wrapped.sql"),
        "BEGIN; CREATE TABLE public.wrapped_probe(id integer); COMMIT;\n",
      );
      for (const plane of planes)
        writeFileSync(
          join(root, `migrations/manifests/${plane}.txt`),
          `wrapped.sql\n${migration}\n`,
        );
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--network",
        "none",
        "--mount",
        `type=bind,src=${root},dst=/fixture,readonly`,
        "--tmpfs",
        "/var/lib/postgresql/data",
        "-e",
        "POSTGRES_PASSWORD_FILE=/fixture/password",
        "athyper/postgres:16.15-hardened",
      );
      for (let attempt = 0; ; attempt++) {
        if (command("exec", name, "pg_isready", "-U", "postgres").status === 0)
          break;
        assert.ok(attempt < 60, "disposable PostgreSQL readiness");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      for (const plane of planes) {
        docker("exec", name, "createdb", "-U", "postgres", `athyper_${plane}`);
        sql(plane, "CREATE SCHEMA master;");
      }
      // The actual historical file creates a table before referencing shared
      // functions. Missing those dependencies forces a genuine mid-file SQL error.
      const failed = run();
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /schema "shared" does not exist/);
      assert.equal(
        sql(
          "studio",
          "SELECT to_regclass('master.reference_choice_recent') IS NULL",
        ),
        "t",
      );
      assert.equal(
        sql("studio", "SELECT to_regclass('public.wrapped_probe') IS NOT NULL"),
        "t",
      );
      assert.equal(
        sql(
          "studio",
          `SELECT status || '|' || sha256 FROM public.athyper_schema_migration_v1 WHERE migration_name='${migration}'`,
        ),
        `failed|${checksum}`,
      );
      assert.match(run().stderr, /operator resolution is required/);

      // Reset only this disposable failed database, then apply with dependencies.
      docker("exec", name, "dropdb", "-U", "postgres", "athyper_studio");
      docker("exec", name, "createdb", "-U", "postgres", "athyper_studio");
      sql("studio", "CREATE SCHEMA master;");
      for (const plane of planes)
        sql(
          plane,
          `
      CREATE SCHEMA shared;
      CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    `,
        );
      const success = run();
      assert.equal(success.status, 0, success.stderr);
      for (const plane of planes) {
        assert.equal(
          sql(
            plane,
            "SELECT to_regclass('master.reference_choice_recent') IS NOT NULL",
          ),
          "t",
        );
        assert.equal(
          sql(
            plane,
            `SELECT status || '|' || sha256 FROM public.athyper_schema_migration_v1 WHERE migration_name='${migration}'`,
          ),
          `applied|${checksum}`,
        );
      }
      const ledger = () =>
        planes.map((plane) =>
          sql(
            plane,
            "SELECT row_to_json(m)::text FROM public.athyper_schema_migration_v1 m ORDER BY migration_name",
          ),
        );
      const before = ledger();
      const replay = run();
      assert.equal(replay.status, 0, replay.stderr);
      assert.match(replay.stdout, /already applied/);
      assert.deepEqual(ledger(), before);
      writeFileSync(
        join(root, "migrations", migration),
        Buffer.concat([source, Buffer.from("\n-- tampered\n")]),
      );
      assert.match(
        run().stderr,
        /checksum differs from the runner transaction manifest/,
      );
      assert.deepEqual(ledger(), before);
      writeFileSync(
        join(root, "migrations/wrapped.sql"),
        "BEGIN; SELECT 1; COMMIT;\n",
      );
      assert.match(run().stderr, /checksum differs from the migration ledger/);
    } finally {
      command("rm", "-fv", name);
      rmSync(root, { recursive: true, force: true });
    }
  },
);
