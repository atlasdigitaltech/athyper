import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureDevPublication } from "./dev-workspace.mjs";

test("recovery configuration is private, DEV-only and worker-only", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-recovery-config-"));
  try {
    const path = join(root, "recovery.json");
    const databaseUrl = "postgresql://athyper_dev_publication_recovery:test@db:5432/athyper_studio";
    writeFileSync(path, JSON.stringify({ databaseUrl }), { mode: 0o600 });
    const config = { services: { worker: {}, scheduler: {} } };
    configureDevPublication(config, "devfull", join(root, "absent"), path);
    assert.equal(config.services.worker.environment.PUBLICATION_RECOVERY_DATABASE_URL, databaseUrl);
    assert.equal(config.services.scheduler.environment.PUBLICATION_RECOVERY_DATABASE_URL, undefined);
    writeFileSync(path, JSON.stringify({ databaseUrl: databaseUrl.replace("@db:", "@qa-db:") }));
    assert.throws(() => configureDevPublication(config, "devfull", join(root, "absent"), path), /Invalid DEV recovery/);
    chmodSync(path, 0o644);
    assert.throws(() => configureDevPublication(config, "devfull", join(root, "absent"), path), /Private DEV recovery/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
