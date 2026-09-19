import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

for (const [instance, preserveVapid] of [
  ["dev", false],
  ["qa", false],
  ["stg", false],
  ["stg", true],
]) {
  test(`${instance} bootstrap installs 25 owner-only secrets and refuses overwrite (preserve VAPID: ${preserveVapid})`, () => {
    const root = mkdtempSync(join(tmpdir(), "bootstrap-audit-"));
    try {
      const disposition = join(root, "disposition.json");
      writeFileSync(
        disposition,
        JSON.stringify({
          kind: "StackV1Disposition",
          decision: "clean-slate",
          legacyData: "disposable",
          restoreAuthorized: false,
          oldSecretsReuseAuthorized: false,
          rawVolumeReuseAuthorized: false,
        }),
      );
      const args =
        instance === "dev"
          ? ["deploy/bootstrap/generate-dev-secrets.sh"]
          : ["deploy/bootstrap/generate-instance-secrets.sh", instance];
      const run = () =>
        spawnSync("bash", args, {
          encoding: "utf8",
          env: {
            ...process.env,
            ATHYPER_RUNTIME_ROOT: root,
            ATHYPER_STACK_V1_DISPOSITION: disposition,
          },
        });
      const secretRoot = join(root, "instances", instance, "secrets");
      const preserved = [
        "vapid-subject",
        "vapid-public-key",
        "vapid-private-key",
      ];
      if (preserveVapid) {
        mkdirSync(secretRoot, { recursive: true, mode: 0o700 });
        for (const name of preserved)
          writeFileSync(join(secretRoot, name), `preserved-${name}`, {
            mode: 0o600,
          });
      }
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      const names = readdirSync(secretRoot);
      assert.equal(names.length, 25);
      assert.equal(statSync(secretRoot).mode & 0o777, 0o700);
      for (const name of names)
        assert.equal(statSync(join(secretRoot, name)).mode & 0o777, 0o600);
      assert.equal(
        JSON.parse(
          readFileSync(
            join(root, "instances", instance, "secrets-receipt.json"),
            "utf8",
          ),
        ).secretCount,
        25,
      );
      if (preserveVapid)
        for (const name of preserved)
          assert.equal(
            readFileSync(join(secretRoot, name), "utf8"),
            `preserved-${name}`,
          );
      const before = readFileSync(join(secretRoot, "redis-password"), "utf8");
      assert.notEqual(run().status, 0);
      assert.equal(
        readFileSync(join(secretRoot, "redis-password"), "utf8"),
        before,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("STG installer accepts optional secrets and rejects unknown names without altering installed data", () => {
  const root = mkdtempSync(join(tmpdir(), "install-audit-"));
  try {
    const source = join(root, "source");
    writeFileSync(source, "fixture");
    const run = (name, path = source) =>
      spawnSync(
        "sh",
        ["deploy/bootstrap/install-stg-secret.sh", name, "--from-file", path],
        {
          encoding: "utf8",
          env: { ...process.env, ATHYPER_RUNTIME_ROOT: root },
        },
      );
    for (const name of [
      "analytics-db-password",
      "grafana-admin-password",
      "infisical-auth-secret",
      "infisical-db-password",
      "infisical-encryption-key",
      "publication-infisical-token",
    ]) {
      const result = run(name);
      assert.equal(result.status, 0, result.stderr);
      const dest = join(root, "instances/stg/secrets", name);
      assert.equal(statSync(dest).mode & 0o777, 0o600);
      assert.notEqual(run(name, join(root, "missing")).status, 0);
      assert.equal(readFileSync(dest, "utf8"), "fixture");
    }
    assert.notEqual(run("unknown-secret").status, 0);
    for (const name of [
      "runtime-db-password",
      "worker-db-password",
      "redis-password",
      "infisical-db-password",
    ]) {
      const password = ' #reserved:/?@\\" password ';
      writeFileSync(source, password);
      assert.equal(run(name).status, 0);
      const destination = join(root, "instances/stg/secrets", name);
      assert.equal(readFileSync(destination, "utf8"), password);
      for (const invalid of [
        "trailing\n",
        "embedded\rvalue",
        "nul\0value",
        "x".repeat(1025),
      ]) {
        writeFileSync(source, invalid);
        assert.notEqual(run(name).status, 0);
        assert.equal(
          readFileSync(destination, "utf8"),
          password,
          "invalid rotation preserves installed secret",
        );
      }
    }
    writeFileSync(source, "line one\nline two\n");
    assert.equal(run("vapid-private-key").status, 0);
    assert.equal(
      readFileSync(
        join(root, "instances/stg/secrets/vapid-private-key"),
        "utf8",
      ),
      "line one\nline two\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
