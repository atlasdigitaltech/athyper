import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePublishArguments } from "./dev-publish.mjs";
import { configureDevPublication } from "./dev-workspace.mjs";
test("tenant setup is explicit and cannot silently retarget publication", () => {
  assert.equal(parsePublishArguments(["--setup", "--tenant", "athyper"]).tenant, "athyper");
  assert.equal(parsePublishArguments(["--setup"]).tenant, "cirrusatlantic");
  assert.throws(() => parsePublishArguments(["--tenant", "athyper", "--dry-run"]));
  assert.throws(() => parsePublishArguments(["--setup", "--tenant", "all"]));
  assert.throws(() => parsePublishArguments(["--setup", "--tenant", "athyper", "--tenant", "cirrusatlantic"]));
});
test("CLI accepts loopback turbo but never remote credential destinations", () => {
  assert.equal(parsePublishArguments(["--dry-run"]).dryRun, true);
  assert.equal(
    parsePublishArguments(["--url", "http://127.0.0.1:4000"]).url,
    "http://127.0.0.1:4000",
  );
  for (const url of [
    "https://api.qa.athyper.test",
    "http://localhost.evil.test",
    "http://user@localhost",
    "http://localhost/path",
  ])
    assert.throws(() => parsePublishArguments(["--url", url]));
  assert.throws(() => parsePublishArguments(["--setup", "--dry-run"]));
  assert.throws(() => parsePublishArguments(["--environment", "qa"]));
});
test("only DEVFULL API and publication workers receive read-only configuration; client secrets are never mounted", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-publish-compose-"));
  try {
    const path = join(dir, "server.json");
    writeFileSync(path, "{}");
    const config = {
      services: {
        api: { environment: {}, volumes: [] },
        worker: { environment: {}, volumes: [] },
      },
    };
    configureDevPublication(config, "devfull", path);
    configureDevPublication(config, "devfull", path);
    assert.equal(config.services.api.volumes.filter(m => m.target === "/run/dev-publication/server.json").length, 1);
    assert.equal(config.services.api.volumes.find(m => m.target === "/run/dev-publication/server.json").read_only, true);
    assert.equal(config.services.worker.volumes.length, 1);
    assert.equal(config.services.worker.volumes[0].read_only, true);
    configureDevPublication(config, "devsimple", path);
    assert.equal(config.services.api.volumes.filter(m => m.target === "/run/dev-publication/server.json").length, 0);
    assert.equal(config.services.worker.volumes.length, 0);
    assert.equal(
      config.services.api.environment.ATHYPER_DEV_PUBLICATION_CONFIG,
      undefined,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("DEV recreation retains format routing in both presets without changing compiled-only planes", () => {
  for (const preset of ["devfull", "devsimple"]) {
    const config = { services: Object.fromEntries(["api", "worker", "scheduler"].map(name =>
      [name, { environment: { METADATA_COMPILED_ONLY_PLANES: "neon" }, volumes: [] }])) };
    configureDevPublication(config, preset, "/nonexistent/dev-publication.json");
    const recreated = JSON.parse(JSON.stringify(config));
    configureDevPublication(recreated, preset, "/nonexistent/dev-publication.json");
    for (const service of Object.values(recreated.services)) {
      assert.equal(service.environment.METADATA_FORMAT_ROUTING, "true");
      assert.equal(service.environment.METADATA_COMPILED_ONLY_PLANES, "neon");
    }
  }
});
