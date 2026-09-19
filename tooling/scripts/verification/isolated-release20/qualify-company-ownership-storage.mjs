import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const path = "server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260911_company_owned_case_pilot.sql",
  source = fs.readFileSync(path, "utf8");
const table = "business_partner_company_setup_request";
const body = source
  .slice(
    source.indexOf("CREATE OR REPLACE FUNCTION"),
    source.indexOf("\nCREATE TRIGGER"),
  )
  .replaceAll("document.", "bp_owner_test.")
  .replaceAll("snapshot.entity_snapshot", "bp_owner_test.entity_snapshot")
  .replaceAll("pg_catalog,document", "pg_catalog,bp_owner_test");
const sql = `BEGIN;
CREATE SCHEMA bp_owner_test;
CREATE TABLE bp_owner_test.entity_snapshot(tenant_id uuid,snapshot_id uuid,payload_json jsonb);
CREATE TABLE bp_owner_test.entity_case(id uuid,tenant_id uuid,entity_code text,operation_code text,owner_company_code_id uuid,target_entity_id uuid,current_snapshot_id uuid);
${body}
CREATE TRIGGER company_owned_case BEFORE INSERT OR UPDATE ON bp_owner_test.entity_case FOR EACH ROW EXECUTE FUNCTION bp_owner_test.trg_company_owned_case();
INSERT INTO bp_owner_test.entity_snapshot VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','{"companyCodeId":"793b6cb3-3c61-57c0-9562-2cbc288bd4cf","operatingOrganizationId":"a478f9c0-8226-5d22-9599-b8fb27a45180"}');
INSERT INTO bp_owner_test.entity_snapshot SELECT tenant_id,'22222222-2222-4222-8222-222222222222',jsonb_set(payload_json,'{companyCodeId}','"33333333-3333-4333-8333-333333333333"') FROM bp_owner_test.entity_snapshot;
INSERT INTO bp_owner_test.entity_case VALUES('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','master.${table}','configure_company','793b6cb3-3c61-57c0-9562-2cbc288bd4cf','f7688c3d-8c92-5651-a469-da3f4f786375','11111111-1111-4111-8111-111111111111');
DO $test$ DECLARE q text; n integer:=0; BEGIN
 FOREACH q IN ARRAY ARRAY[
  'UPDATE bp_owner_test.entity_case SET owner_company_code_id=NULL',
  'UPDATE bp_owner_test.entity_case SET owner_company_code_id=''33333333-3333-4333-8333-333333333333''',
  'UPDATE bp_owner_test.entity_case SET tenant_id=''33333333-3333-4333-8333-333333333333''',
  'UPDATE bp_owner_test.entity_case SET target_entity_id=''33333333-3333-4333-8333-333333333333''',
  'UPDATE bp_owner_test.entity_case SET entity_code=''master.business_partner''',
  'UPDATE bp_owner_test.entity_case SET operation_code=''new_partner''',
  'UPDATE bp_owner_test.entity_case SET current_snapshot_id=''22222222-2222-4222-8222-222222222222'''
 ] LOOP
  BEGIN EXECUTE q;RAISE EXCEPTION 'Owner mutation accepted';
  EXCEPTION WHEN check_violation THEN n:=n+1;END;
 END LOOP;
 IF n<>7 THEN RAISE EXCEPTION 'Missing rejection'; END IF;
END $test$;
ROLLBACK;`;
const container = JSON.parse(
  cp.execFileSync("docker", ["inspect", "athyper-bp-r20-db"], {
    encoding: "utf8",
  }),
)[0];
assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [
  "athyper-bp-r20-isolated",
]);
// Exercise complete DDL against real FK/catalog definitions, rolling it back.
for (const input of [source.replace(/COMMIT;\s*$/, "ROLLBACK;"), sql]) {
  const out = cp.execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-bp-r20-db",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  assert.ok(out.trim().endsWith("ROLLBACK"));
}
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  migration: path,
  migrationSha256: createHash("sha256").update(source).digest("hex"),
  ddlQualified: true,
  validStoredOwnerAccepted: true,
  rejectedMutations: 7,
  rolledBack: true,
  deployed: false,
  authenticatedOwnershipJourneyQualified: false,
  limitations: [
    "Production trigger body exercised in a scratch table against the real clone company/organization/BP catalog.",
    "Native pilot publication, runtime/service bindings and authenticated lifecycle remain required.",
  ],
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-company-owner-storage.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
