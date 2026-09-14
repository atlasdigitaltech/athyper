import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const directory = resolve(import.meta.dirname, "../instance");
for (const cloud of [false, true])
  test(`provider overlay preserves parity VAPID mounts (AWS storage: ${cloud})`, () => {
    const files = [
      "compose.yaml",
      "compose.parity.yaml",
      "compose.notification-providers.yaml",
      ...(cloud ? ["compose.aws-storage.yaml"] : []),
    ].map((file) => resolve(directory, file));
    const env = {
      ...process.env,
      ATHYPER_RUNTIME_ROOT: "/tmp/compose-merge-test",
      ATHYPER_INSTANCE: "stg",
      ATHYPER_ENV: "staging",
      S3_REGION: "ap-southeast-1",
      S3_BUCKET_DOCUMENTS: "audit-documents",
      S3_BUCKET_ARTIFACTS: "audit-artifacts",
      S3_BUCKET_TRANSFERS: "audit-transfers",
      APP_S3_PROFILE: "app",
      ARTIFACTS_WRITER_S3_PROFILE: "writer",
      ATHYPER_AWS_AUTH_ROOT: "/tmp/audit-aws",
    };
    for (const file of files)
      for (const [, key] of readFileSync(file, "utf8").matchAll(
        /\$\{([A-Z_0-9]+):\?/g,
      ))
        env[key] ??= "audit-fixture";
    const result = spawnSync(
      "docker",
      [
        "compose",
        ...files.flatMap((file) => ["-f", file]),
        "config",
        "--format",
        "json",
      ],
      { env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    for (const name of ["api", "worker"])
      for (const suffix of ["subject", "public-key", "private-key"]) {
        const secret = "vapid-" + suffix,
          key = "VAPID_" + suffix.replaceAll("-", "_").toUpperCase() + "_FILE";
        assert.equal(
          config.services[name].environment[key],
          "/run/secrets/" + secret,
        );
        assert.equal(
          config.services[name].secrets.filter(
            (entry) => entry.source === secret,
          ).length,
          1,
        );
        assert.ok(
          config.secrets[secret].file.endsWith(
            "/instances/stg/secrets/" + secret,
          ),
        );
      }
  });
