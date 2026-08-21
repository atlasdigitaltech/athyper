import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
test("phase 8 dependency manifest names every required exclusion", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "config/governance/meta-entity-dependencies.json"), "utf8"));
  for (const exclusion of ["object-storage-attachment-transfer", "sse-shared-fanout-redesign", "global-redis-deployment-separation", "domain-specific-query-mutation-optimization", "arbitrary-mutable-record-caching"]) {
    assert.ok(manifest.exclusions.includes(exclusion), exclusion);
  }
});
