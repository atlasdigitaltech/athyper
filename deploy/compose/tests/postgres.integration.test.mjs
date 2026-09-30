import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
const YAML = createRequire(
  new URL("../../stackctl/package.json", import.meta.url),
)("yaml");
test(
  "hardened PostgreSQL initializes with a file secret, drops privileges and persists across restart",
  { skip: process.env.ATHYPER_POSTGRES_TESTS !== "true" },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-hardening-"));
    const project = dir.split("/").at(-1).toLowerCase();
    const password = 'fixture quote " slash \\ spaces';
    const service = YAML.parse(
      readFileSync("deploy/compose/instance/compose.yaml", "utf8"),
    ).services.db;
    service.image = "athyper/postgres:16.15-hardened";
    delete service.build;
    delete service.ports;
    service.restart = "no";
    writeFileSync(join(dir, "password"), password, { mode: 0o600 });
    const file = join(dir, "compose.json");
    writeFileSync(
      file,
      JSON.stringify({
        services: { db: service },
        networks: { data: { internal: true } },
        volumes: { "db-data": {} },
        secrets: { "postgres-password": { file: join(dir, "password") } },
      }),
    );
    const run = (...args) => {
      const r = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
      assert.equal(
        r.status,
        0,
        (r.stderr ?? "").replaceAll(password, "[redacted]"),
      );
      return r.stdout.trim();
    };
    const compose = (...args) =>
      run("compose", "-p", project, "-f", file, ...args);
    const exec = (...args) => compose("exec", "-T", "db", ...args);
    const sql = (q) =>
      exec("psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", q);
    try {
      compose("up", "-d", "--wait");
      assert.match(sql("show server_version"), /^16\.15/);
      assert.match(exec("cat", "/proc/1/status"), /Uid:\s+999\s+999/);
      exec("sh", "-c", "test ! -e /usr/local/bin/gosu");
      assert.equal(
        exec(
          "sh",
          "-c",
          'export PGPASSWORD="$(cat /run/secrets/postgres-password)"; psql -h 127.0.0.1 -U postgres -Atc "select 1"',
        ),
        "1",
      );
      const inspect = JSON.parse(run("inspect", compose("ps", "-q", "db")))[0];
      assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
      assert.ok(!JSON.stringify(inspect.Config).includes(password));
      sql(
        "CREATE TABLE persistence_probe(id int primary key); INSERT INTO persistence_probe VALUES(42);",
      );
      compose("restart", "db");
      compose("up", "-d", "--wait");
      assert.equal(sql("SELECT id FROM persistence_probe"), "42");
    } finally {
      compose("down", "--volumes", "--timeout", "5");
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
