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

function psql(container, input) {
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
      "postgres",
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
  } finally {
    if (created) docker("rm", "-f", container);
  }
});
