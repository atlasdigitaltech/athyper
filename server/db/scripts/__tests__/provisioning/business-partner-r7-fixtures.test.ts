import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildR7DatabaseFixtures } from "../../provisioning/provision-business-partner-r7-fixtures.js";
const source = readFileSync(
  new URL(
    "../../provisioning/provision-business-partner-r7-fixtures.ts",
    import.meta.url,
  ),
  "utf8",
);
test("R7 fixture identities are deterministic and authority-safe", () => {
  assert.deepEqual(buildR7DatabaseFixtures(), buildR7DatabaseFixtures());
  assert.equal(new Set(Object.values(buildR7DatabaseFixtures())).size, 5);
  assert.match(source, /rebuild_disposable_neon_database/);
  assert.match(source, /status !== "approved"/);
  assert.match(source, /engagement_status !== "active"/);
  assert.match(source, /placement_count !== 0/);
  assert.doesNotMatch(
    source,
    /BP-Q004.*hash|BP-Q006.*hash|SUPPLIER_WORKFORCE_POLICY_COORDINATES_JSON/,
  );
});
