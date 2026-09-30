import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "./binding-recovery-probe.mjs";

const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
test("canonical binding recovery preserves expiry, refuses resurrection, and rolls back", async () => {
  const container = `athyper-binding-recovery-${randomUUID()}`;
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
      "athyper.purpose=binding-recovery-test",
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
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    assert.ok(ready, "disposable PostgreSQL must become ready");
    const output = execFileSync(
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
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    assert.ok(output.trim().endsWith("ROLLBACK"));
    assert.equal(
      docker(
        "exec",
        container,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-At",
        "-c",
        "SELECT count(*) FROM pg_namespace WHERE nspname='bp_recovery_test'",
      ).trim(),
      "0",
    );
  } finally {
    if (created) docker("rm", "-f", container);
  }
});
