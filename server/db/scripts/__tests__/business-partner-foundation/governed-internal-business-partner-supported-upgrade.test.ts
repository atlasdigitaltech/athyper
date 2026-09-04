import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
test("G1 supported-upgrade HTTP certification starts from the pinned baseline and cleans up", async () => {
  const [source, baseline] = await Promise.all([
    readFile(
      resolve(
        root,
        "scripts/tests/integration/certify-g1-supported-upgrade-http.mjs",
      ),
      "utf8",
    ),
    readFile(resolve(root, "migrations/baselines/2026-09-03.v1.json"), "utf8"),
  ]);
  for (const token of [
    "baseline.gitRevision",
    "forwardMigrations",
    "01_service_roles.sql",
    "applyAdminSql",
    "expandGitSql",
    "expandCurrentSql",
    "restoreMigrationOnlyWorkforceIamProjection",
    "20260829_neon_workforce_lifecycle.sql",
    "provision-three-plane.ts",
    "governed-entity-case-foundation.mjs",
    "governed-internal-business-partner-http.mjs",
    "finally",
    'docker",["rm","-f",container]',
    "G1_GOVERNED_INTERNAL_BUSINESS_PARTNER_SUPPORTED_UPGRADE_HTTP_OK",
  ])
    assert.ok(source.includes(token), `missing ${token}`);
  assert.match(source, /refusing to replace existing container/);
  assert.match(source, /athyper\.environment=disposable_local/);
  assert.match(source, /postgres:16\.13-bookworm/);
  assert.match(source, /replace\(\/\^\\uFEFF\/u/);
  assert.match(source, /set_config\('app\.database_plane'/);
  assert.match(source, /set_config\('app\.current_principal_id'/);
  assert.match(
    baseline,
    /"contractVersion": "athyper\.database-upgrade-baseline\.v1"/,
  );
});
