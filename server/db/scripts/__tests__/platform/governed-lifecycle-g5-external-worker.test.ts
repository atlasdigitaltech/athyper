import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const dbRoot = resolve(import.meta.dirname, "../../..");

test("G5 external-worker identity projection is engagement-scoped on clean and supported-upgrade paths", async () => {
  const [tables, migration, manifest] = await Promise.all([
    readFile(
      resolve(dbRoot, "ddl/planes/studio/trustiam/03_tables.sql"),
      "utf8",
    ),
    readFile(
      resolve(
        dbRoot,
        "migrations/20260903_studio_external_worker_identity_projection.sql",
      ),
      "utf8",
    ),
    readFile(resolve(dbRoot, "migrations/manifests/studio.txt"), "utf8"),
  ]);
  for (const source of [tables, migration]) {
    assert.match(source, /relationship_kind[^\n]+external_worker/);
    assert.match(source, /worker_engagement:%/);
    assert.match(
      source,
      /UNIQUE\s*\(authority_tenant_id,\s*source_plane,\s*source_tenant_id,\s*relationship_kind,\s*source_ref\)/s,
    );
  }
  assert.match(
    migration,
    /Duplicate identity source coordinates require reconciliation before migration/,
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS trustiam\.identity_projection/,
  );
  assert.match(migration, /trustiam_identity_projection_organization_fk/);
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS trustiam_identity_projection_reconcile_idx/,
  );
  assert.match(
    manifest,
    /^20260903_studio_external_worker_identity_projection\.sql$/m,
  );
  assert.doesNotMatch(
    migration,
    /DELETE FROM\s+(?:master\.person|master\.external_worker|document\.worker_engagement)/i,
  );
});
