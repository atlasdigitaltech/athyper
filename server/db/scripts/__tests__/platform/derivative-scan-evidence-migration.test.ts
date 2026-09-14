import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

const MIGRATION_PATH =
  "scripts/operations/upgrades/legacy-baseline-20260914/20260911_derivative_scan_evidence.sql";
const PLANES = ["neon", "mesh", "studio"] as const;

test("fresh manifests install canonical derivative definitions without replaying the legacy upgrade", async () => {
  for (const plane of PLANES) {
    const manifest = await read(`migrations/manifests/${plane}.txt`);
    assert.ok(
      !manifest
        .split("\n")
        .some(
          (line) => line.trim() === "20260911_derivative_scan_evidence.sql",
        ),
    );
    const foundation = await read(`ddl/planes/${plane}/_manifest.txt`);
    for (const path of [
      "common/document/03_foundation_tables.sql",
      `planes/${plane}/document/02_domains.sql`,
      `planes/${plane}/document/06_indexes.sql`,
    ]) {
      assert.ok(
        foundation.split("\n").includes(path),
        `${plane}: missing ${path}`,
      );
    }
  }
});

test("the migration's status domain check matches each plane's canonical domain definition", async () => {
  const migration = await read(MIGRATION_PATH);
  const migrationCheck = migration.match(
    /ALTER DOMAIN document\.attachment_derivative_status_d ADD CONSTRAINT attachment_derivative_status_d_check\s*\n\s*CHECK \(VALUE IN \([^)]*\)\);/,
  )?.[0];
  assert.ok(
    migrationCheck,
    "migration is missing the attachment_derivative_status_d_check definition",
  );
  assert.match(
    migrationCheck!,
    /'quarantined'/,
    "migration's status check must add 'quarantined'",
  );

  for (const plane of PLANES) {
    const domains = await read(`ddl/planes/${plane}/document/02_domains.sql`);
    const canonicalCheck = domains.match(
      /ALTER DOMAIN document\.attachment_derivative_status_d ADD CONSTRAINT attachment_derivative_status_d_check\s*\n\s*CHECK \(VALUE IN \([^)]*\)\);/,
    )?.[0];
    assert.ok(
      canonicalCheck,
      `${plane}/02_domains.sql is missing attachment_derivative_status_d_check`,
    );
    assert.equal(
      migrationCheck,
      canonicalCheck,
      `${plane} domain check has drifted from the migration`,
    );
  }
});

test("the migration's scan_status check matches the canonical foundation table definition", async () => {
  const migration = await read(MIGRATION_PATH);
  const canonical = await read("ddl/common/document/03_foundation_tables.sql");

  const migrationConstraint = migration.match(
    /ADD CONSTRAINT attachment_derivative_scan_status_chk\s*\n\s*CHECK \([\s\S]*?\);/,
  )?.[0];
  const canonicalConstraint = canonical.match(
    /CONSTRAINT attachment_derivative_scan_status_chk\s*\n\s*CHECK \([\s\S]*?\)\n/,
  )?.[0];
  assert.ok(
    migrationConstraint,
    "migration is missing attachment_derivative_scan_status_chk",
  );
  assert.ok(
    canonicalConstraint,
    "canonical foundation table is missing attachment_derivative_scan_status_chk",
  );
  // Compare only the CHECK clause body, since the two forms differ in ADD CONSTRAINT wrapping.
  const body = (sql: string) => sql.match(/CHECK \(([\s\S]*?)\)/)?.[1]?.trim();
  assert.equal(body(migrationConstraint!), body(canonicalConstraint!));

  assert.ok(
    canonical.includes("scanned_at           timestamptz,"),
    "canonical table is missing the scanned_at column",
  );
  assert.ok(
    canonical.includes("scan_status          text,"),
    "canonical table is missing the scan_status column",
  );
});

test("the migration is safe to re-run: every mutation is guarded so a retry after a partial failure does not error", async () => {
  const migration = await read(MIGRATION_PATH);
  assert.ok(
    migration.includes("BEGIN;") && migration.includes("COMMIT;"),
    "migration must run in a transaction",
  );
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS attachment_derivative_status_d_check/,
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS scanned_at/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS scan_status/);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS attachment_derivative_scan_status_chk/,
  );
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS attachment_derivative_scan_pending_idx/,
  );
});

test("the scan-pending partial index matches across the canonical DDL for every plane", async () => {
  const expected = [
    "CREATE INDEX attachment_derivative_scan_pending_idx",
    "    ON document.attachment_derivative (tenant_id, id)",
    "    WHERE status = 'ready' AND scanned_at IS NULL;",
  ].join("\n");
  for (const plane of PLANES) {
    const indexes = await read(`ddl/planes/${plane}/document/06_indexes.sql`);
    assert.ok(
      indexes.includes(expected),
      `${plane}/06_indexes.sql is missing or has drifted from attachment_derivative_scan_pending_idx`,
    );
  }
});
