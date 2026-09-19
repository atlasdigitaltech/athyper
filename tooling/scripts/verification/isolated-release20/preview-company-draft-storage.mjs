import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
// Local rollback-only storage preview. This does not replace the shared/clone
// authority guard required by authenticated qualification scripts.
function cloneAuthority() {
  const c = JSON.parse(
    cp.execFileSync("docker", ["inspect", "athyper-bp-r20-db"], {
      encoding: "utf8",
    }),
  )[0];
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks), [
    "athyper-bp-r20-isolated",
  ]);
  const tables = [
    "role",
    "role_permission",
    "group_member",
    "group_role",
    "plane_membership",
    "delegation",
    "delegation_grant",
    "permission",
    "permission_scope_kind",
    "deny_rule",
    "record_acl",
    "override",
    "scope_target",
    "principal_group",
  ];
  const query = tables
    .map(
      (t) =>
        `SELECT '${t}',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM authz.${t} r`,
    )
    .join(" UNION ALL ");
  const rows = cp.execFileSync(
    "docker",
    [
      "exec",
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
      "-c",
      query,
    ],
    { encoding: "utf8" },
  );
  return {
    sha256: createHash("sha256")
      .update(c.Id + rows)
      .digest("hex"),
  };
}
const paths = [
  "server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260911_company_owned_case_pilot.sql",
  "server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260911_company_owned_case_draft.sql",
];
const source = paths.map((p) =>
  fs
    .readFileSync(p, "utf8")
    .replace(/^BEGIN;\s*/m, "")
    .replace(/COMMIT;\s*$/, ""),
);
const before = cloneAuthority();
const sql = `BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL app.database_plane='neon';
SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';
SET LOCAL app.current_principal_id='cca94907-7519-5871-8e3c-6b11aa545c93';
${source.join("\n")}
DO $test$
DECLARE original document.entity_case%ROWTYPE;published runtime_meta.entity_contract%ROWTYPE;fixture runtime_meta.entity_contract%ROWTYPE;payload jsonb;new_id uuid:=gen_random_uuid();legacy_id uuid:=gen_random_uuid();result record;owner uuid;rejected integer:=0;key text;
BEGIN
 SELECT c.* INTO STRICT original FROM document.entity_case c JOIN runtime_meta.entity_contract k ON k.tenant_id=c.tenant_id AND k.id=c.entity_contract_id
 WHERE c.tenant_id='44444444-4444-4444-8444-444444444444' AND c.entity_code='master.business_partner' AND c.operation_code='configure_company' ORDER BY c.created_at DESC LIMIT 1;
 SELECT * INTO STRICT published FROM runtime_meta.entity_contract WHERE tenant_id=original.tenant_id AND entity_code=original.entity_code AND status='published' ORDER BY release_no DESC LIMIT 1;
 SELECT payload_json INTO STRICT payload FROM snapshot.entity_snapshot WHERE tenant_id=original.tenant_id AND snapshot_id=original.current_snapshot_id;
 -- Explicit unsigned local fixture, transaction-private; never a publication receipt.
 fixture:=published;fixture.id:=gen_random_uuid();fixture.entity_id:=gen_random_uuid();fixture.release_id:=gen_random_uuid();fixture.revision_id:=gen_random_uuid();fixture.entity_code:='master.business_partner_company_setup_request';fixture.publication_key:='local.company-pilot.fixture';fixture.signature:='UNSIGNED_LOCAL_SQL_FIXTURE';fixture.signing_key_id:='local-preview-only';
 INSERT INTO runtime_meta.entity_contract SELECT (fixture).*;
 SELECT * INTO STRICT result FROM document.command_entity_case_draft(original.tenant_id,new_id,0,NULL,'BPC-'||upper(replace(new_id::text,'-','')),fixture.entity_code,'configure_company',original.target_entity_id,'local-company-fixture',fixture.id,fixture.entity_contract_hash,original.form_template_release_id,original.form_template_release_no,original.form_template_hash,payload,'local-company-'||new_id::text,'cca94907-7519-5871-8e3c-6b11aa545c93');
 SELECT owner_company_code_id INTO owner FROM document.entity_case WHERE id=new_id;
 IF owner IS DISTINCT FROM (payload->>'companyCodeId')::uuid OR result.row_version<>1 THEN RAISE EXCEPTION 'Owner not persisted by native draft'; END IF;
 BEGIN UPDATE document.entity_case SET owner_company_code_id=NULL WHERE id=new_id;RAISE EXCEPTION 'Owner removal accepted';EXCEPTION WHEN check_violation THEN rejected:=rejected+1;END;
 BEGIN UPDATE document.entity_case SET entity_code='master.business_partner' WHERE id=new_id;RAISE EXCEPTION 'Owner identity rewrite accepted';EXCEPTION WHEN check_violation THEN rejected:=rejected+1;END;
 BEGIN
  PERFORM * FROM document.command_entity_case_draft(original.tenant_id,new_id,1,result.snapshot_id,'BPC-'||upper(replace(new_id::text,'-','')),fixture.entity_code,'configure_company',original.target_entity_id,'local-company-fixture',fixture.id,fixture.entity_contract_hash,original.form_template_release_id,original.form_template_release_no,original.form_template_hash,jsonb_set(payload,'{companyCodeId}',to_jsonb(gen_random_uuid()::text)),'local-company-update-'||new_id::text,'cca94907-7519-5871-8e3c-6b11aa545c93');
  RAISE EXCEPTION 'Snapshot owner rewrite accepted';
 EXCEPTION WHEN check_violation THEN rejected:=rejected+1;END;
 BEGIN
  PERFORM * FROM document.command_entity_case_draft(original.tenant_id,gen_random_uuid(),0,NULL,'BPC-MISSING-'||upper(substr(new_id::text,1,8)),fixture.entity_code,'configure_company',original.target_entity_id,'local-company-fixture',fixture.id,fixture.entity_contract_hash,original.form_template_release_id,original.form_template_release_no,original.form_template_hash,payload-'companyCodeId','local-company-missing-'||new_id::text,'cca94907-7519-5871-8e3c-6b11aa545c93');
  RAISE EXCEPTION 'Missing owner accepted';
 EXCEPTION WHEN check_violation THEN rejected:=rejected+1;END;
 IF (SELECT row_version FROM document.entity_case WHERE id=new_id)<>1 THEN RAISE EXCEPTION 'Failed owner update changed the case';END IF;
 -- Existing organization-owned draft creation remains independent.
 SELECT * INTO STRICT result FROM document.command_entity_case_draft(original.tenant_id,legacy_id,0,NULL,'BPL-'||upper(replace(legacy_id::text,'-','')),published.entity_code,'configure_company',original.target_entity_id,'local-legacy-fixture',published.id,published.entity_contract_hash,original.form_template_release_id,original.form_template_release_no,original.form_template_hash,payload,'local-legacy-'||legacy_id::text,'cca94907-7519-5871-8e3c-6b11aa545c93');
 IF EXISTS(SELECT 1 FROM document.entity_case WHERE id=legacy_id AND owner_company_code_id IS NOT NULL) THEN RAISE EXCEPTION 'Legacy ownership changed'; END IF;
 IF rejected<>4 THEN RAISE EXCEPTION 'Missing ownership rejection';END IF;
END $test$;
ROLLBACK;`;
const output = cp.execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-bp-r20-db",
    "psql",
    "-X",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
  ],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
assert.ok(output.trim().endsWith("ROLLBACK"));
assert.equal(cloneAuthority().sha256, before.sha256);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  checks: [
    "native_draft_persists_company_owner",
    "owner_removal_rejected",
    "identity_reclassification_rejected",
    "native_snapshot_owner_rewrite_rejected",
    "missing_owner_creation_rejected",
    "legacy_native_draft_owner_remains_null",
  ],
  passed: true,
  rolledBack: true,
  authenticatedJourney: false,
  publicationQualified: false,
  sharedAuthorityQualified: false,
  localPreviewOnly: true,
  fixtureSignature: "UNSIGNED_LOCAL_SQL_FIXTURE",
  authoritySha256: before.sha256,
  migrations: paths.map((path) => ({
    path,
    sha256: createHash("sha256").update(fs.readFileSync(path)).digest("hex"),
  })),
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-company-native-draft-storage.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
