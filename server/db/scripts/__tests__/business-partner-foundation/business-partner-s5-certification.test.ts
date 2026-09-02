import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("S5 formal matrix covers runtime, admin, owners, and PUBLIC",async()=>{
  const matrix=JSON.parse(await read("../../config/governance/business-partner-s5-role-permission-matrix.v1.json"));
  assert.deepEqual(matrix.roles,["athyperapp","athyperadmin","object_owner","PUBLIC"]);
  assert.deepEqual(matrix.rules.map((rule:{code:string})=>rule.code),["command_execute","internal_function_execute","evidence_read","evidence_mutation","lifecycle_column_update","decision_column_update"]);
  assert.equal(matrix.certification.failClosed,true);
  for(const rule of matrix.rules)for(const role of matrix.roles)assert.equal(typeof rule.expected[role],"boolean");
});

test("S5 live certification covers failures, replay, concurrency, atomicity, RLS, and composite FKs",async()=>{
  const source=await read("scripts/business-partner-360/run-business-partner-s5-certification.ts");
  for(const probe of ["cross_tenant_command","cross_tenant_fk","direct_lifecycle_update_app","direct_lifecycle_update_owner","direct_decision_update_app","direct_decision_update_owner","direct_evidence_insert_app","direct_evidence_update_owner","direct_evidence_delete_owner","stale_expected_version","exact_idempotent_replay","idempotency_fingerprint_collision","self_approval","invalid_lifecycle_transition","oversized_evidence_json","protected_evidence_json","internal_function_app","lifecycle_one_winner","lifecycle_exact_replay","decision_one_winner","decision_exact_replay"])assert.match(source,new RegExp(probe));
  assert.match(source,/relforcerowsecurity/);
  assert.match(source,/nonCompositeTenantReferences/);
  assert.match(source,/committedCounts\.evidence===1&&committedCounts\.outbox===1&&committedCounts\.audit>=1/);
  assert.match(source,/rollbackCounts\.evidence===0&&rollbackCounts\.outbox===0&&rollbackCounts\.audit===0/);
  assert.match(source,/RUN-BP-S5-CERTIFICATION/);
  assert.match(source,/assertLoopbackDatabaseTarget/);
  assert.match(source,/writeFile\(destination/);
});

test("S5 protected evidence hardening is canonical and upgrade-owned",async()=>{
  const functions=await read("ddl/planes/neon/control/07_functions.sql"),triggers=await read("ddl/planes/neon/control/08_triggers.sql"),grants=await read("ddl/planes/neon/control/11_grants.sql"),migration=await read("migrations/20260903_neon_business_partner_security_certification_hardening.sql"),manifest=await read("migrations/manifests/neon.txt");
  for(const source of [functions,migration]){assert.match(source,/fn_business_partner_payload_has_restricted_key/);assert.match(source,/protected identity data/);}
  assert.match(triggers,/BEFORE INSERT ON control\.business_partner_mutation_evidence/);
  assert.match(grants,/REVOKE ALL ON FUNCTION control\.trg_guard_business_partner_mutation_evidence_payload\(\) FROM PUBLIC/);
  assert.match(manifest,/20260903_neon_business_partner_security_mutation_ownership\.sql\n20260903_neon_business_partner_security_certification_hardening\.sql/);
  assert.match(manifest,/20260902_neon_business_partner_organization_boundary\.sql\n20260902_neon_workforce_request_lifecycle\.sql/);
  assert.match(migration,/DROP TRIGGER IF EXISTS trg_business_partner_05_normalize/);
});
