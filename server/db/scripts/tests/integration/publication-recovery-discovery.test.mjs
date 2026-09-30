import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const fixture = readFileSync(
  resolve(root, "tests/publication-recovery-discovery.sql"),
  "utf8",
);
const ddl = readFileSync(
  resolve(root, "ddl/planes/studio/publication/19_recovery_discovery.sql"),
  "utf8",
);
const assertions = readFileSync(
  resolve(root, "tests/publication-recovery-discovery-assertions.sql"),
  "utf8",
);

function docker(...args) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function psql(container, input, database = "postgres") {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

test("recovery discovery exposes bounded coordinates only to its dedicated role", async () => {
  const container = `athyper-publication-recovery-${randomUUID()}`;
  let created = false;
  try {
    docker(
      "run",
      "-d",
      "--name",
      container,
      "--network",
      "none",
      "--label",
      "athyper.purpose=publication-recovery-test",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:16.15-bookworm",
    );
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        docker(
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
        );
        ready = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 250));
      }
    }
    assert.ok(ready, "disposable PostgreSQL must become ready");
    psql(container, fixture);
    psql(container, ddl);
    psql(container, assertions);
    psql(container, "CREATE DATABASE athyper_studio TEMPLATE postgres;");
    const oldMigration = readFileSync(
      resolve(root, "migrations/20260930_publication_recovery_discovery.sql"),
      "utf8",
    );
    const upgrade = readFileSync(
      resolve(root, "migrations/20260930_publication_ack_recovery.sql"),
      "utf8",
    );
    const count = (expected) =>
      `DO $$ BEGIN IF (SELECT count(*) FROM publication.fn_recoverable_deployment_coordinates(NULL,NULL,200)) <> ${expected} THEN RAISE EXCEPTION 'Unexpected discovery count'; END IF; END $$;`;
    const snapshot = () =>
      psql(
        container,
        "SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM publication.deployment d;",
        "athyper_studio",
      );
    psql(container, oldMigration, "athyper_studio");
    psql(container, count(2), "athyper_studio");
    const before = snapshot();
    psql(container, upgrade, "athyper_studio");
    psql(container, count(3), "athyper_studio");
    assert.equal(snapshot(), before, "upgrade preserves deployment records");
    psql(container, upgrade, "athyper_studio");
    psql(container, count(3), "athyper_studio");
    assert.equal(
      snapshot(),
      before,
      "upgrade replay preserves deployment records",
    );
    assert.throws(() => psql(container, upgrade), /Studio database required/);
  } finally {
    if (created) docker("rm", "-f", container);
  }
});
