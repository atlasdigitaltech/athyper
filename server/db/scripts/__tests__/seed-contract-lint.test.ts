import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lintSeedSource } from "../seed/lint-seed-contracts.js";

const header = `-- seed-contract-version: 1
-- seed-pack: common.shared.example
-- seed-pack-version: 1.0.0
-- seed-dataset: shared.example
-- seed-data-class: production_reference
-- seed-provenance: {"source":"internal","publisher":"Athyper","source_version":"1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: shared.example(code)
-- seed-cross-file-ids: false
-- seed-id-strategy: natural-key-only
-- seed-expected-row-count: exact:1
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
`;

const assertions = `
DO $assert$
BEGIN
  -- seed-assertion: expected-count
  -- seed-assertion: orphan
  -- seed-assertion: uniqueness
  -- seed-assertion: semantic
  IF false THEN RAISE EXCEPTION 'failed'; END IF;
END $assert$;
`;

describe("seed contract v1 lint", () => {
  it("accepts a convergent, scoped, schema-qualified production seed", () => {
    const source = `${header}
DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) IS NULL THEN RAISE EXCEPTION 'plane'; END IF;
END $guard$;
INSERT INTO shared.example (code, name, created_by)
VALUES ('one', 'One', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now(),
  updated_by = EXCLUDED.created_by
WHERE shared.example.name IS DISTINCT FROM EXCLUDED.name;
${assertions}`;
    assert.deepEqual(lintSeedSource(source), []);
  });

  it("rejects missing metadata, DDL, destructive deletes, and unqualified relations", () => {
    const source = `CREATE TABLE bad (id uuid); DELETE FROM bad;`;
    const ids = new Set(lintSeedSource(source).map((item) => item.ruleId));
    assert(ids.has("metadata.missing"));
    assert(ids.has("structure.forbidden-ddl"));
    assert(ids.has("lifecycle.destructive-delete"));
    assert(ids.has("relation.unqualified"));
  });

  it("rejects non-convergent inserts, legacy relations, and hard-coded tenant IDs", () => {
    const source = `${header.replace("-- seed-tenant-scope: none", "-- seed-tenant-scope: tenant")}
DO $guard$
BEGIN
  PERFORM current_setting('app.database_plane', true);
  PERFORM current_setting('app.seed_tenant_id', true);
  IF false THEN RAISE EXCEPTION 'guard'; END IF;
END $guard$;
INSERT INTO shared.workspace (tenant_id, code)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'one')
ON CONFLICT (code) DO NOTHING;
${assertions}`;
    const ids = new Set(lintSeedSource(source).map((item) => item.ruleId));
    assert(ids.has("scope.hardcoded-tenant"));
    assert(ids.has("relation.legacy-name"));
    assert(ids.has("convergence.do-nothing"));
  });

  it("requires deterministic UUIDs for cross-file references", () => {
    const source = `${header
      .replace("-- seed-cross-file-ids: false", "-- seed-cross-file-ids: true")}
DO $guard$ BEGIN
  PERFORM current_setting('app.database_plane', true);
  IF false THEN RAISE EXCEPTION 'guard'; END IF;
END $guard$;
${assertions}`;
    assert(lintSeedSource(source).some((item) => item.ruleId === "identity.deterministic"));
  });
});
