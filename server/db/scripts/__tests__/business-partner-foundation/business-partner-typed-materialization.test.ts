import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const sourceRoot = resolve(root, "../packages/services/master-data/src");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("BS360-01 stages each identity extension in a typed tenant-bound relation", async () => {
  const [
    migration,
    tables,
    constraints,
    indexes,
    functions,
    triggers,
    rls,
    grants,
  ] = await Promise.all([
    read(
      "migrations/20260830_neon_business_partner_typed_request_extensions.sql",
    ),
    read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/05_constraints.sql"),
    read("ddl/planes/neon/document/06_indexes.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),
    read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/10_rls.sql"),
    read("ddl/planes/neon/document/11_grants.sql"),
  ]);
  for (const table of [
    "address",
    "contact_person",
    "contact_channel",
    "identifier",
    "tax_registration",
    "classification",
    "certification",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TABLE document\\.business_partner_request_${table}\\(`,
      ),
    );
    for (const canonical of [
      tables,
      constraints,
      indexes,
      triggers,
      rls,
      grants,
    ]) {
      assert.match(
        canonical,
        new RegExp(`business_partner_request_${table}\\b`),
      );
    }
  }
  for (const canonical of [
    tables,
    constraints,
    indexes,
    triggers,
    rls,
    grants,
  ]) {
    assert.match(canonical, /business_partner_request_materialization_item\b/);
  }
  assert.match(
    migration,
    /extension_mode text NOT NULL DEFAULT 'legacy_untyped'/,
  );
  assert.match(
    tables,
    /extension_mode\s+text\s+NOT NULL DEFAULT 'legacy_untyped'/,
  );
  assert.match(
    migration,
    /extension_mode='typed_v1' AND extension_fingerprint ~ '\^\[a-f0-9\]\{64\}\$'/,
  );
  assert.match(migration, /FOREIGN KEY\(tenant_id,request_id\)/);
  assert.match(
    migration,
    /Typed request extensions are editable only before submission/,
  );
  assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
  assert.match(
    functions,
    /Typed request extensions are editable only before submission/,
  );
  assert.match(functions, /fn_business_partner_payload_has_restricted_key/);
});

test("S0 records an explicit disposition for canonical, compatibility, and retired BP relations", async () => {
  const [disposition, inventory] = await Promise.all([
    read("ddl/planes/neon/business-partner-ddl-disposition.v1.json"),
    read("ddl/planes/neon/business-partner-ddl-inventory.generated.json"),
  ]);
  assert.match(
    disposition,
    /document\.business_partner_invitation_applicant_policy/,
  );
  assert.match(disposition, /master\.legal_entity_business_partner_link/);
  assert.match(inventory, /"disposition": "compatibility_view"/);
  assert.match(inventory, /"disposition": "retired"/);
  assert.match(
    inventory,
    /document\.business_partner_request_materialization_item/,
  );
});

test("S0 catalog ownership rebinds published permissions through suspension", async () => {
  const migration = await read(
    "migrations/20260831_neon_business_partner_catalog_ownership.sql",
  );
  assert.match(
    migration,
    /CREATE TEMP TABLE bp_permission_catalog_rebind ON COMMIT DROP/,
  );
  assert.match(
    migration,
    /target\.status = 'published'[\s\S]*UPDATE authz\.permission AS permission[\s\S]*SET module_id/,
  );
  assert.match(
    migration,
    /SET status = 'published'[\s\S]*target\.status = 'published'/,
  );
  assert.match(
    migration,
    /Retired Business Partner permissions cannot be rebound/,
  );
});

test("BS360-01 closes restricted JSON and records immutable application coordinates", async () => {
  const [
    migration,
    grantMigration,
    parityMigration,
    repository,
    service,
    manifest,
  ] = await Promise.all([
    read(
      "migrations/20260830_neon_business_partner_typed_request_extensions.sql",
    ),
    read(
      "migrations/20260902_neon_business_partner_typed_request_function_grants.sql",
    ),
    read(
      "migrations/20260902_neon_business_partner_typed_request_catalog_parity.sql",
    ),
    readFile(
      resolve(sourceRoot, "kysely-business-partner-request-repository.ts"),
      "utf8",
    ),
    readFile(
      resolve(sourceRoot, "business-partner-request-service.ts"),
      "utf8",
    ),
    read("migrations/manifests/neon.txt"),
  ]);
  assert.match(migration, /fn_business_partner_payload_has_restricted_key/);
  assert.match(migration, /nationalidentifier/);
  assert.match(migration, /materialization evidence is immutable/);
  assert.match(
    repository,
    /materializeIdentityExtensions\(input,request,text\(partner,"id"\),transaction\)/,
  );
  assert.match(
    repository,
    /INSERT INTO document\.business_partner_request_materialization_item/,
  );
  assert.match(repository, /BUSINESS_PARTNER_REQUEST_EXTENSION_DRIFT/);
  assert.match(repository, /extensionSummary:request\.extensionSummary/);
  assert.match(repository, /protected_value_token/);
  assert.match(service, /extensionSummary:request\.extensionSummary/);
  assert.match(service, /BUSINESS_PARTNER_REQUEST_VOLATILE_VALIDATION_FAILED/);
  assert.doesNotMatch(service, /payload: \{[^}]*proposedPayload/);
  assert.match(
    manifest,
    /^20260830_neon_business_partner_typed_request_extensions\.sql$/m,
  );
  assert.match(
    manifest,
    /^20260902_neon_business_partner_typed_request_function_grants\.sql$/m,
  );
  assert.match(
    manifest,
    /^20260902_neon_business_partner_typed_request_catalog_parity\.sql$/m,
  );
  assert.match(
    grantMigration,
    /REVOKE ALL ON FUNCTION document\.fn_business_partner_payload_has_restricted_key\(jsonb\) FROM PUBLIC/,
  );
  assert.match(
    grantMigration,
    /GRANT EXECUTE ON FUNCTION document\.trg_guard_business_partner_request_extension\(\) TO athyperapp/,
  );
  assert.match(parityMigration, /CREATE TRIGGER trg_zz_audit_row_change/);
  assert.match(
    parityMigration,
    /CREATE OR REPLACE FUNCTION document\.trg_guard_business_partner_request_extension/,
  );
});
