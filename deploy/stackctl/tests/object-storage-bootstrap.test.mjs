import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const provision = resolve(
  "deploy/bootstrap/provision-dev-artifacts-writer.mjs",
);
test("existing DEV writer provisioning preserves secrets and refuses partial pairs", () => {
  const root = mkdtempSync(join(tmpdir(), "storage-secrets-"));
  try {
    const secrets = join(root, "instances/dev/secrets");
    mkdirSync(secrets, { recursive: true });
    writeFileSync(join(secrets, "objectstorage-app-secret-key"), "keep-me");
    const run = () =>
      spawnSync(process.execPath, [provision], {
        env: { ...process.env, ATHYPER_RUNTIME_ROOT: root },
        encoding: "utf8",
      });
    assert.equal(run().status, 0);
    const access = join(secrets, "objectstorage-artifacts-writer-access-key"),
      secret = join(secrets, "objectstorage-artifacts-writer-secret-key");
    const before = readFileSync(secret, "utf8");
    assert.equal(run().status, 0);
    assert.equal(readFileSync(secret, "utf8"), before);
    assert.equal(statSync(secret).mode & 0o777, 0o600);
    assert.equal(
      readFileSync(join(secrets, "objectstorage-app-secret-key"), "utf8"),
      "keep-me",
    );
    rmSync(access);
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(secret, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
