import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test(
  "runtime and Infisical wrappers preserve password bytes and reject invalid files",
  { skip: process.env.ATHYPER_CREDENTIAL_TESTS !== "true" },
  () => {
    const root = resolve(import.meta.dirname, "../../.."),
      dir = mkdtempSync(join(tmpdir(), "credentials-"));
    chmodSync(dir, 0o755);
    mkdirSync(join(dir, "dist"));
    const password = ' #:/?@\\" Unicode-λ ';
    const names = [
      "runtime-db-password",
      "worker-db-password",
      "redis-password",
      "infisical-db-password",
      "infisical-encryption-key",
      "infisical-auth-secret",
      "runtime-iam-client-secret",
      "search-api-key",
      "objectstorage-app-access-key",
      "objectstorage-app-secret-key",
      "objectstorage-artifacts-writer-access-key",
      "objectstorage-artifacts-writer-secret-key",
    ];
    try {
      for (const name of names)
        writeFileSync(join(dir, name), password, { mode: 0o600 });
      // Only synthetic values enter the fixture. Assertions never print credentials.
      writeFileSync(
        join(dir, "dist/main.js"),
        `const fs=require('fs'),a=require('assert/strict'); for(const name of ['DATABASE_URL','NEON_WORKER_DATABASE_URL','REDIS_URL','DB_CONNECTION_URI']) {if(!process.env[name])continue;const u=new URL(process.env[name]);a.equal(decodeURIComponent(u.password),fs.readFileSync('/run/secrets/redis-password','utf8'));} console.log('credentials preserved');`,
      );
      for (const script of ["start-runtime.sh", "start-infisical.sh"]) {
        const run = () =>
          spawnSync(
            "docker",
            [
              "run",
              "--rm",
              "--network",
              "none",
              "--read-only",
              "--cap-drop",
              "ALL",
              "--user",
              `${process.getuid()}:${process.getgid()}`,
              "--workdir",
              "/fixture",
              "-v",
              `${dir}:/fixture:ro`,
              "-v",
              `${dir}:/run/secrets:ro`,
              "-v",
              `${dir}:/run/searchcore:ro`,
              "-v",
              `${root}/deploy/compose/instance/scripts/${script}:/script.sh:ro`,
              "--entrypoint",
              "/bin/sh",
              "venatum/bull-board:3.3.17",
              "/script.sh",
              ...(script === "start-infisical.sh"
                ? ["node", "dist/main.js"]
                : []),
            ],
            { encoding: "utf8", timeout: 30000 },
          );
        let result = run();
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /credentials preserved/);
        for (const invalid of [
          "bad\n",
          "bad\r",
          "bad\0secret",
          "",
          Buffer.from([0xff]),
        ]) {
          writeFileSync(join(dir, "redis-password"), invalid);
          result = run();
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, /Password must contain/);
        }
        writeFileSync(join(dir, "redis-password"), password);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
