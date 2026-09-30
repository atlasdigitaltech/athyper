import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(join(root, "deploy/stackctl/package.json"));
const config = require("yaml").parse(
  readFileSync(join(root, "deploy/compose/instance/compose.yaml"), "utf8"),
);
for (const service of Object.values(config.services))
  if (service.image)
    service.image = service.image.replace(
      /\$\{([^:}]+):-([^}]+)\}/g,
      (_, key, fallback) => process.env[key] ?? fallback,
    );
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const attempt = (...args) =>
  spawnSync("docker", args, { encoding: "utf8", timeout: 15000 });
const pause = () => new Promise((resolve) => setTimeout(resolve, 500));

// Opt in: only disposable containers, a disposable data volume, and an isolated network.
test(
  "poolers enforce static authentication and detect backend failures with reduced capabilities",
  {
    skip: process.env.ATHYPER_PGBOUNCER_TESTS !== "true",
    timeout: 180000,
  },
  async () => {
    const id = `pgbouncer-test-${randomUUID().slice(0, 8)}`;
    const directory = mkdtempSync(join(tmpdir(), id));
    const containers = [];
    const secrets = {
      "postgres-password": randomUUID(),
      "iam-db-password": randomUUID(),
      "runtime-db-password": ' runtime"with:colon\\slash ',
      "worker-db-password": ' worker"with:colon\\slash ',
    };
    const writeSecret = (name, value) =>
      writeFileSync(join(directory, name), value, { mode: 0o600 });
    for (const [name, value] of Object.entries(secrets))
      writeSecret(name, value);
    const serviceArgs = (name) => {
      const service = config.services[name];
      const args = [
        "--network",
        id,
        "--security-opt",
        "no-new-privileges:true",
        "--read-only",
        "--tmpfs",
        "/tmp",
      ];
      for (const cap of service.cap_drop ?? []) args.push("--cap-drop", cap);
      for (const cap of service.cap_add ?? []) args.push("--cap-add", cap);
      for (const secret of service.secrets)
        args.push("-v", `${join(directory, secret)}:/run/secrets/${secret}:ro`);
      for (const volume of service.volumes)
        args.push("-v", join(root, "deploy/compose/instance", volume));
      for (const [key, value] of Object.entries(service.environment)) {
        args.push(
          "-e",
          `${key}=${String(value).replace(/\$\{[^:]+:-([^}]+)\}/g, "$1")}`,
        );
      }
      args.push("--user", service.user ?? "0:0");
      return args;
    };
    const health = (container) =>
      attempt(
        "exec",
        container,
        "/bin/sh",
        "/athyper/bin/healthcheck-pgbouncer.sh",
      );
    try {
      docker("network", "create", "--internal", id);
      docker("volume", "create", id);
      const db = `${id}-db`;
      containers.push(db);
      docker(
        "run",
        "-d",
        "--name",
        db,
        "--network",
        id,
        "--network-alias",
        "db",
        "-v",
        `${id}:/var/lib/postgresql/data`,
        "-v",
        `${join(directory, "postgres-password")}:/run/secrets/postgres-password:ro`,
        "-e",
        "POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password",
        config.services.db.image,
      );
      for (let i = 0; ; i++) {
        if (attempt("exec", db, "pg_isready", "-U", "postgres").status === 0)
          break;
        assert.ok(i < 60, "database startup deadline");
        await pause();
      }
      for (let i = 0; i < 2; i++) {
        docker(
          "run",
          "--rm",
          ...serviceArgs("db-init"),
          "--entrypoint",
          "/bin/bash",
          config.services["db-init"].image,
          "/athyper/bin/init-postgres.sh",
        );
      }
      // A valid PostgreSQL role absent from the pooler allowlist must be denied.
      docker(
        "exec",
        db,
        "psql",
        "-U",
        "postgres",
        "-c",
        "CREATE ROLE unlisted LOGIN PASSWORD 'test-unlisted'; GRANT CONNECT ON DATABASE athyper_neon TO unlisted;",
      );
      docker(
        "exec",
        "-e",
        "PGPASSWORD=test-unlisted",
        db,
        "psql",
        "-Xw",
        "-h",
        "127.0.0.1",
        "-U",
        "unlisted",
        "-d",
        "athyper_neon",
        "-c",
        "SELECT 1",
      );
      for (const name of ["dbpool-apps", "dbpool-session"]) {
        const container = `${id}-${name}`;
        containers.push(container);
        docker(
          "run",
          "-d",
          "--name",
          container,
          ...serviceArgs(name),
          "-e",
          "ATHYPER_PGBOUNCER_DEFAULT_POOL_SIZE=3",
          "-e",
          "ATHYPER_PGBOUNCER_MAX_DB_CONNECTIONS=8",
          "--entrypoint",
          "/bin/sh",
          config.services[name].image,
          "/athyper/bin/start-pgbouncer.sh",
        );
        for (let i = 0; ; i++) {
          if (health(container).status === 0) break;
          assert.ok(i < 30, `health deadline for ${name}`);
          await pause();
        }
        // A listener-only probe stays green even when the health credential fails.
        docker(
          "exec",
          "--user",
          "70:70",
          container,
          "sh",
          "-c",
          "cp /tmp/pgbouncer-health.pgpass /tmp/health-backup; printf '%s\\n' '127.0.0.1:5432:*:*:incorrect' > /tmp/pgbouncer-health.pgpass",
        );
        assert.equal(
          attempt(
            "exec",
            container,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "postgres",
          ).status,
          0,
        );
        assert.notEqual(
          health(container).status,
          0,
          "bad credentials must fail healthcheck",
        );
        docker(
          "exec",
          "--user",
          "70:70",
          container,
          "sh",
          "-c",
          "cat /tmp/health-backup > /tmp/pgbouncer-health.pgpass; rm /tmp/health-backup",
        );
        assert.equal(health(container).status, 0);
        const generated = docker(
          "exec",
          container,
          "cat",
          "/tmp/pgbouncer.ini",
        );
        assert.match(generated, /default_pool_size = 3/);
        assert.match(generated, /max_db_connections = 8/);
        assert.doesNotMatch(generated, /auth_user/);
        assert.equal(
          docker(
            "exec",
            container,
            "stat",
            "-c",
            "%a",
            "/tmp/userlist.txt",
            "/tmp/pgbouncer-health.pgpass",
          ),
          "600\n600",
        );
        const processes = docker("exec", container, "ps", "-o", "user,args");
        assert.match(processes, /postgres\s+\/usr\/bin\/pgbouncer/);
        assert.notEqual(
          attempt(
            "exec",
            "-e",
            "PGPASSWORD=test-unlisted",
            container,
            "psql",
            "-Xw",
            "-h",
            "127.0.0.1",
            "-U",
            "unlisted",
            "-d",
            "athyper_neon",
            "-c",
            "SELECT 1",
          ).status,
          0,
        );
      }
      const invalid = (value, env, expected) => {
        writeSecret("runtime-db-password", value);
        const result = attempt(
          "run",
          "--rm",
          ...serviceArgs("dbpool-apps"),
          ...env,
          "--entrypoint",
          "/bin/sh",
          config.services["dbpool-apps"].image,
          "/athyper/bin/start-pgbouncer.sh",
        );
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, expected);
        if (value.length > 8 && !value.includes("\0"))
          assert.ok(
            !result.stderr.includes(value),
            "secret must not be logged",
          );
      };
      for (const value of ["", "x".repeat(1025)])
        invalid(value, [], /1\.\.1024 bytes/);
      for (const value of ["bad\n", "bad\r", "bad\0secret"])
        invalid(value, [], /NUL, CR or LF/);
      invalid(
        secrets["runtime-db-password"],
        ["-e", "ATHYPER_POOL_MODE=invalid"],
        /must be transaction or session/,
      );
      invalid(
        secrets["runtime-db-password"],
        ["-e", "ATHYPER_PGBOUNCER_DEFAULT_POOL_SIZE=oops"],
        /must be an integer/,
      );
      invalid(
        secrets["runtime-db-password"],
        ["-e", "ATHYPER_PGBOUNCER_MAX_CLIENT_CONN=0"],
        /outside the supported range/,
      );
      writeSecret("runtime-db-password", secrets["runtime-db-password"]);
      docker("stop", "-t", "1", db);
      for (const container of containers.slice(1))
        assert.notEqual(
          health(container).status,
          0,
          "backend outage must fail healthcheck",
        );
      docker("start", db);
      for (const container of containers.slice(1)) {
        for (let i = 0; ; i++) {
          if (health(container).status === 0) break;
          assert.ok(i < 30, "recovery deadline");
          await pause();
        }
      }
    } finally {
      for (const container of containers.reverse())
        attempt("rm", "-f", container);
      attempt("network", "rm", id);
      attempt("volume", "rm", id);
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
