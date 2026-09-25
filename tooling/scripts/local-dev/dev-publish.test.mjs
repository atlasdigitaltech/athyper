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
    assert.equal(config.services.api.volumes.length, 1);
    assert.equal(config.services.api.volumes[0].read_only, true);
    assert.equal(config.services.worker.volumes.length, 1);
    assert.equal(config.services.worker.volumes[0].read_only, true);
    configureDevPublication(config, "devsimple", path);
    assert.equal(config.services.api.volumes.length, 0);
    assert.equal(config.services.worker.volumes.length, 0);
    assert.equal(
      config.services.api.environment.ATHYPER_DEV_PUBLICATION_CONFIG,
      undefined,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
