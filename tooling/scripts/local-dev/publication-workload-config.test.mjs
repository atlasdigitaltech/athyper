import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureDevPublicationWorkload } from "./publication-workload-config.mjs";
test("recreation preserves only DEVFULL API/worker workload mounts and rejects unsafe configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "workload-compose-")),
    path = join(root, "workload.json");
  const input = {
    schemaVersion: 1,
    instance: "dev",
    tenantId: "11111111-1111-4111-8111-111111111111",
    realmKey: "platform-control",
    author: {
      principalId: "author",
      code: "dev.metadata.author",
      credentialSha256: "a".repeat(64),
      authEpoch: 0,
    },
    publisher: {
      principalId: "publisher",
      code: "dev.metadata.publisher",
      credentialSha256: "b".repeat(64),
      authEpoch: 0,
    },
  };
  const config = {
    services: Object.fromEntries(
      ["api", "worker", "scheduler", "neon-web"].map((name) => [
        name,
        { environment: {}, volumes: [] },
      ]),
    ),
  };
  try {
    writeFileSync(path, JSON.stringify(input), { mode: 0o600 });
    configureDevPublicationWorkload(config, "devfull", path);
    configureDevPublicationWorkload(config, "devfull", path);
    for (const name of ["api", "worker"]) {
      assert.equal(config.services[name].volumes.length, 1);
      assert.equal(config.services[name].volumes[0].read_only, true);
      assert.equal(
        config.services[name].environment.PLATFORM_AUTHORITY_TENANT_ID,
        input.tenantId,
      );
    }
    assert.equal(config.services["neon-web"].volumes.length, 0);
    assert.equal(config.services.scheduler.volumes.length, 0);
    configureDevPublicationWorkload(config, "devsimple", path);
    for (const service of Object.values(config.services)) {
      assert.equal(service.volumes.length, 0);
      assert.equal(service.environment.PUBLICATION_WORKLOAD_CONFIG, undefined);
    }
    chmodSync(path, 0o644);
    assert.throws(
      () => configureDevPublicationWorkload(config, "devfull", path),
      /Private DEV/,
    );
    chmodSync(path, 0o600);
    writeFileSync(
      path,
      JSON.stringify({ ...input, clientToken: "must-not-mount" }),
    );
    assert.throws(
      () => configureDevPublicationWorkload(config, "devfull", path),
      /Invalid DEV/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
