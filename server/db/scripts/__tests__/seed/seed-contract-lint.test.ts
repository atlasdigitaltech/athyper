import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lintSeedSource } from "../../seed/lint-seed-contracts.js";

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

  it("rejects corrupted seed text", () => {
    for (const corrupted of ["broken ?? separator", "broken \uFFFD character"]) {
      const findings = lintSeedSource(`${header}\n-- ${corrupted}\n${assertions}`);
      assert(
        findings.some((finding) => finding.ruleId === "content.encoding-corruption"),
      );
    }
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
    const source = `${header.replace(
      "-- seed-cross-file-ids: false",
      "-- seed-cross-file-ids: true",
    )}
DO $guard$ BEGIN
  PERFORM current_setting('app.database_plane', true);
  IF false THEN RAISE EXCEPTION 'guard'; END IF;
END $guard$;
${assertions}`;
    assert(
      lintSeedSource(source).some(
        (item) => item.ruleId === "identity.deterministic",
      ),
    );
  });

  it("rejects production seed writes to runtime-only authorization state", () => {
    const relations = [
      "delegation",
      "delegation_grant",
      "deny_rule",
      "override",
      "record_acl",
      "trusted_device",
    ];
    const writes = relations
      .map(
        (relation) =>
          `UPDATE authz.${relation} SET status = 'active' WHERE false;`,
      )
      .join("\n");
    const findings = lintSeedSource(`${header}
DO $guard$ BEGIN
  PERFORM current_setting('app.database_plane', true);
  IF false THEN RAISE EXCEPTION 'guard'; END IF;
END $guard$;
${writes}
${assertions}`).filter(
      (finding) => finding.ruleId === "runtime-only.authorization-write",
    );
    assert.equal(findings.length, relations.length);
    for (const relation of relations) {
      assert(
        findings.some((finding) =>
          finding.message.includes(`authz.${relation}`),
        ),
      );
    }
  });

  it("routes application projection writes through Studio-to-plane reconciliation", () => {
    const source = `${header}
DO $guard$ BEGIN
  PERFORM current_setting('app.database_plane', true);
  IF false THEN RAISE EXCEPTION 'guard'; END IF;
END $guard$;
INSERT INTO authz.application_projection (id) VALUES (gen_random_uuid()) ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id WHERE authz.application_projection.id IS DISTINCT FROM EXCLUDED.id;
MERGE INTO "authz"."projection_provider" AS target USING shared.example AS source ON false WHEN NOT MATCHED THEN INSERT (id) VALUES (source.id);
COPY authz.projection_scope (id) FROM STDIN;
${assertions}`;
    const findings = lintSeedSource(source).filter(
      (finding) =>
        finding.ruleId === "runtime-only.application-projection-write",
    );
    assert.equal(findings.length, 3);
    assert(
      findings.every((finding) =>
        finding.message.includes("Studio-to-plane reconciliation"),
      ),
    );
  });

  it("allows reads and ignores protected relation names in comments and literals", () => {
    const source = `${header}
DO $guard$ BEGIN
  PERFORM current_setting('app.database_plane', true);
  PERFORM 'INSERT INTO authz.deny_rule';
  -- UPDATE authz.application_projection SET status = 'active';
  IF EXISTS (SELECT 1 FROM authz.trusted_device WHERE false) THEN RAISE EXCEPTION 'guard'; END IF;
END $guard$;
${assertions}`;
    assert.equal(
      lintSeedSource(source).some((finding) =>
        finding.ruleId.startsWith("runtime-only."),
      ),
      false,
    );
  });
});

it("accepts key-only membership replay but rejects mutable payload and incomplete conflict keys", () => {
  const statement = "INSERT INTO control.owner_type_purpose(owner_type_id,capability,purpose_code,created_by) SELECT o.id,'contact','default',o.created_by FROM control.owner_type o ON CONFLICT(owner_type_id,capability,purpose_code) DO NOTHING;";
  const convergence = (sql: string) => lintSeedSource(sql).filter(finding => finding.ruleId.startsWith("convergence."));
  assert.deepEqual(convergence(statement), []);
  assert(convergence(statement.replace("purpose_code,created_by", "purpose_code,status,created_by")).some(finding => finding.ruleId === "convergence.do-nothing"));
  assert(convergence(statement.replace("ON CONFLICT(owner_type_id,capability,purpose_code)", "ON CONFLICT(owner_type_id)")).some(finding => finding.ruleId === "convergence.do-nothing"));
  assert(convergence(statement.replaceAll("control.owner_type_purpose", "control.lookup_value")).some(finding => finding.ruleId === "convergence.do-nothing"));
});
it("parses LATERAL while still rejecting its unqualified underlying relation", () => {
  const relations = (sql: string) => lintSeedSource(sql).filter(finding => finding.ruleId === "relation.unqualified");
  assert.deepEqual(relations("SELECT * FROM control.owner_type o CROSS JOIN LATERAL (SELECT * FROM control.lookup_value) v"), []);
  assert.equal(relations("SELECT * FROM control.owner_type o CROSS JOIN LATERAL (SELECT * FROM lookup_value) v").length, 1);
  assert.equal(relations("SELECT * FROM control.owner_type o JOIN LATERAL lookup_value v ON true").length, 1);
});
