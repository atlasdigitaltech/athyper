import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
const files = [
  "compose.yaml",
  "compose.parity.yaml",
  "compose.aws-storage.yaml",
];
const keys = [
  "S3_REGION",
  "S3_BUCKET_DOCUMENTS",
  "S3_BUCKET_ARTIFACTS",
  "S3_BUCKET_TRANSFERS",
  "APP_S3_PROFILE",
  "ARTIFACTS_WRITER_S3_PROFILE",
  "ATHYPER_AWS_AUTH_ROOT",
];
const environment = {
  ...process.env,
  ATHYPER_RUNTIME_ROOT: "/tmp/athyper-storage-render-fixture",
  ATHYPER_INSTANCE: "stg",
  ATHYPER_DDL_SHA256: "a".repeat(64),
};
for (const key of keys) delete environment[key];
const render = (env) =>
  spawnSync(
    "docker",
    [
      "compose",
      ...files.flatMap((f) => ["-f", `deploy/compose/instance/${f}`]),
      "config",
      "--format",
      "json",
    ],
    { encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024 },
  );
test("unprovisioned cloud storage fails rendering without local fallback", () => {
  const result = render(environment);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pending provisioning/);
});
test("cloud overlay disables local storage and separates workload profiles", () => {
  const result = render({
    ...environment,
    S3_REGION: "eu-west-1",
    S3_BUCKET_DOCUMENTS: "fixture-documents",
    S3_BUCKET_ARTIFACTS: "fixture-artifacts",
    S3_BUCKET_TRANSFERS: "fixture-transfers",
    APP_S3_PROFILE: "fixture-app",
    ARTIFACTS_WRITER_S3_PROFILE: "fixture-writer",
    ATHYPER_AWS_AUTH_ROOT: "/tmp/athyper-storage-auth-fixture",
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  for (const id of ["api", "worker", "scheduler"]) {
    const service = config.services[id];
    assert.equal(service.environment.ATHYPER_ENV, "staging");
    assert.equal(service.environment.S3_ENDPOINT, "");
    assert.equal(service.environment.S3_PUBLIC_ENDPOINT, "");
    assert.equal(service.depends_on["objectstorage-init"], undefined);
    assert.ok(
      !service.secrets.some((s) => s.source.startsWith("objectstorage-")),
    );
    assert.ok(
      service.volumes.some((v) => v.target === "/run/aws" && v.read_only),
    );
  }
  assert.equal(config.services.objectstorage, undefined);
  assert.equal(config.services["objectstorage-init"], undefined);
});
