import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inventory } from "../scripts/infrastructure-images.mjs";
test("inventory deduplicates exact images and exposes unresolved references", () => {
  const root = mkdtempSync(join(tmpdir(), "infra-inventory-"));
  const image = `redis:7@sha256:${"a".repeat(64)}`;
  try {
    writeFileSync(
      join(root, "compose.yaml"),
      `services:\n  one:\n    image: ${image}\n  two:\n    image: ${image}\n  pinnedDefault:\n    image: \${PINNED_IMAGE:-${image}}\n  app:\n    image: \${APP_IMAGE:-app:dev}\n`,
    );
    const result = inventory(root);
    assert.equal(result.include.length, 1);
    assert.equal(result.include[0].image, image);
    assert.equal(result.excluded.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("scan gate preserves unfixed findings but blocks fixable high severity", () => {
  const root = mkdtempSync(join(tmpdir(), "infra-gate-"));
  const file = join(root, "report.json");
  const run = () =>
    spawnSync(
      process.execPath,
      ["deploy/compose/scripts/gate-infrastructure-scan.mjs", file],
      { encoding: "utf8" },
    ).status;
  try {
    writeFileSync(
      file,
      JSON.stringify({
        SchemaVersion: 2,
        Results: [{ Vulnerabilities: [{ Severity: "CRITICAL" }] }],
      }),
    );
    assert.equal(run(), 0);
    writeFileSync(
      file,
      JSON.stringify({
        SchemaVersion: 2,
        Results: [
          { Vulnerabilities: [{ Severity: "HIGH", FixedVersion: "2" }] },
        ],
      }),
    );
    assert.equal(run(), 1);
    writeFileSync(file, "{}");
    assert.notEqual(run(), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("all core infrastructure families have digest scan coverage", () => {
  const { include } = inventory();
  for (const family of ["nginxinc/nginx-unprivileged:", "axllent/mailpit:"])
    assert.ok(
      include.some((item) => item.image.startsWith(family)),
      family,
    );
});

test("release and image publication require the infrastructure gate", () => {
  const YAML = createRequire(
    new URL("../../stackctl/package.json", import.meta.url),
  )("yaml");
  const read = (name) =>
    YAML.parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
  assert.ok("workflow_call" in read("infrastructure-maintenance").on);
  for (const [name, job] of [
    ["release", "release"],
    ["stack-v2-images", "publish"],
  ]) {
    const workflow = read(name);
    assert.equal(
      workflow.jobs["infrastructure-scan"].uses,
      "./.github/workflows/infrastructure-maintenance.yml",
    );
    assert.ok(workflow.jobs[job].needs.includes("infrastructure-scan"));
  }
});

test("derived PostgreSQL is built and scanned before the maintenance gate passes", () => {
  const workflow = readFileSync(
    ".github/workflows/infrastructure-maintenance.yml",
    "utf8",
  );
  assert.match(
    workflow,
    /docker build -t athyper\/postgres:16\.15-hardened deploy\/config\/postgres/,
  );
  assert.match(
    workflow,
    /gate-infrastructure-scan\.mjs postgres-hardened-scan\.json/,
  );
  assert.match(
    readFileSync("deploy/config/postgres/Dockerfile", "utf8"),
    /FROM postgres:16\.15-bookworm@sha256:[a-f0-9]{64}/,
  );
});

test("derived infrastructure has build/scan coverage for every replacement", () => {
  const { include } = JSON.parse(
    readFileSync(
      "deploy/compose/scripts/derived-infrastructure-images.json",
      "utf8",
    ),
  );
  const expected = [
    "redis",
    "pgbouncer",
    "traefik",
    "meilisearch",
    "gotenberg",
    "tika",
    "seaweedfs",
    "s3-tools",
    "virusscan",
    "searchcore-key-init",
  ];
  assert.deepEqual(include.map((x) => x.id).sort(), expected.sort());
  for (const item of include)
    assert.match(
      readFileSync(`${item.context}/Dockerfile`, "utf8"),
      /@sha256:[a-f0-9]{64}/,
    );
  const workflow = readFileSync(
    ".github/workflows/infrastructure-maintenance.yml",
    "utf8",
  );
  assert.match(workflow, /derived-scan:/);
  assert.match(workflow, /gate-infrastructure-scan.mjs derived-scan.json/);
  assert.ok(
    !inventory().include.some((x) => x.image.includes("minio/")),
    "retired MinIO is absent from deployment manifests",
  );
});
