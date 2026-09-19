import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const path = "server/db/ddl/common/runtime_meta/12_baseline_precondition.sql",
  bytes = fs.readFileSync(path, "utf8");
const body = bytes
  .slice(0, bytes.indexOf("END $$;") + 7)
  .replaceAll("runtime_meta", "bp_reset_activation_test");
const sql = `BEGIN;
CREATE SCHEMA bp_reset_activation_test;
CREATE TABLE bp_reset_activation_test.applied_release(id uuid,source_release_id uuid,manifest jsonb);
CREATE TABLE bp_reset_activation_test.entity_contract(release_id uuid,publication_key text,tenant_id uuid,entity_code text);
CREATE TABLE bp_reset_activation_test.release_activation_head(publication_key text PRIMARY KEY,applied_release_id uuid,source_release_no bigint,row_version bigint,artifact_hash text);
${body}
CREATE TRIGGER guard BEFORE INSERT OR UPDATE ON bp_reset_activation_test.release_activation_head FOR EACH ROW EXECUTE FUNCTION bp_reset_activation_test.trg_baseline_activation_precondition();
INSERT INTO bp_reset_activation_test.applied_release VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','{"evidence":{"importedBaseline":{"kind":"reviewed_empty_target","schemaVersion":1,"tenantId":"44444444-4444-4444-8444-444444444444","entityCode":"business_partner","publicationKey":"metadata.entity.business_partner.reset"}}}');
INSERT INTO bp_reset_activation_test.entity_contract VALUES('22222222-2222-4222-8222-222222222222','metadata.entity.business_partner.reset','44444444-4444-4444-8444-444444444444','business_partner');
CREATE FUNCTION bp_reset_activation_test.reject(q text) RETURNS void LANGUAGE plpgsql AS $test$ BEGIN
 BEGIN EXECUTE q;RAISE EXCEPTION 'Invalid activation accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RESTORATION_EMPTY_TARGET_REQUIRED' THEN RAISE; END IF;END;
END $test$;
INSERT INTO bp_reset_activation_test.release_activation_head VALUES('metadata.entity.business_partner.reset','11111111-1111-4111-8111-111111111111',1,1,'old-hash');
SELECT bp_reset_activation_test.reject('UPDATE bp_reset_activation_test.release_activation_head SET row_version=2');
DELETE FROM bp_reset_activation_test.release_activation_head;
SELECT bp_reset_activation_test.reject($q$INSERT INTO bp_reset_activation_test.release_activation_head VALUES('metadata.entity.business_partner.reset','11111111-1111-4111-8111-111111111111',2,1,'hash')$q$);
SELECT bp_reset_activation_test.reject($q$INSERT INTO bp_reset_activation_test.release_activation_head VALUES('wrong-key','11111111-1111-4111-8111-111111111111',1,1,'hash')$q$);
UPDATE bp_reset_activation_test.entity_contract SET tenant_id='33333333-3333-4333-8333-333333333333';
SELECT bp_reset_activation_test.reject($q$INSERT INTO bp_reset_activation_test.release_activation_head VALUES('metadata.entity.business_partner.reset','11111111-1111-4111-8111-111111111111',1,1,'hash')$q$);
UPDATE bp_reset_activation_test.entity_contract SET tenant_id='44444444-4444-4444-8444-444444444444';
INSERT INTO bp_reset_activation_test.entity_contract VALUES('33333333-3333-4333-8333-333333333333','another-publication-key','44444444-4444-4444-8444-444444444444','business_partner');
SELECT bp_reset_activation_test.reject($q$INSERT INTO bp_reset_activation_test.release_activation_head VALUES('metadata.entity.business_partner.reset','11111111-1111-4111-8111-111111111111',1,1,'hash')$q$);
DELETE FROM bp_reset_activation_test.entity_contract WHERE publication_key='another-publication-key';
INSERT INTO bp_reset_activation_test.release_activation_head VALUES('metadata.entity.business_partner.reset','11111111-1111-4111-8111-111111111111',1,1,'old-hash');
INSERT INTO bp_reset_activation_test.applied_release VALUES('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','{"evidence":{"importedBaseline":{"appliedReleaseId":"11111111-1111-4111-8111-111111111111","rowVersion":1,"sourceReleaseNo":1,"artifactHash":"old-hash"}}}');
UPDATE bp_reset_activation_test.release_activation_head SET applied_release_id='55555555-5555-4555-8555-555555555555',source_release_no=2,row_version=2,artifact_hash='new-hash';
ROLLBACK;`;
const out = cp.execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
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
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
assert.ok(out.trim().endsWith("ROLLBACK"));
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  source: path,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  passed: true,
  checks: 7,
  rolledBack: true,
  localFixtureOnly: true,
  authenticatedReleaseQualification: false,
  grantsChanged: false,
  activationChanged: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-reset-activation-precondition.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(report);
