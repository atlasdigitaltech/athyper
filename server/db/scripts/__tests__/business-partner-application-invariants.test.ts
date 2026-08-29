import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("P1 seals every request kind to one deterministic application result",async()=>{
  const [migration,tables,repository,service,manifest]=await Promise.all([
    read("migrations/20260829_neon_business_partner_request_application_invariants.sql"),
    read("ddl/planes/neon/document/03_tables.sql"),
    read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts"),
    read("../packages/services/master-data/src/business-partner-request-service.ts"),
    read("migrations/manifests/neon.txt"),
  ]);
  const matrix:ReadonlyArray<readonly[string,string]>=[
    ["new_partner","partner_role_created"],["new_partner","workforce_created"],
    ["add_supplier","partner_role_created"],["add_customer","partner_role_created"],
    ["add_workforce","workforce_created"],["amend_partner","partner_amended"],
    ["assign_organization","organization_assigned"],["configure_company","company_configured"],
    ["change_bank","bank_verification_started"],["change_employment","employment_changed"],
    ["deactivate","partner_deactivated"],["reactivate","partner_reactivated"],["archive","partner_archived"],
  ];
  for(const [kind,result] of matrix){assert.match(migration,new RegExp(`WHEN '${kind}'[\\s\\S]{0,500}${result}`));assert.match(tables,new RegExp(`WHEN '${kind}'[\\s\\S]{0,500}${result}`));}
  assert.match(migration,/requested_role='supplier'[\s\S]*partner_role_created[\s\S]*materialized_supplier_id IS NOT NULL/);
  assert.match(migration,/requested_role='customer'[\s\S]*partner_role_created[\s\S]*materialized_customer_id IS NOT NULL/);
  assert.match(migration,/requested_role='workforce'[\s\S]*workforce_created[\s\S]*materialized_person_id IS NOT NULL/);
  assert.match(repository,/request\.kind==="amend_partner"[\s\S]*applyPartnerAmendment/);
  assert.match(repository,/request\.kind==="change_bank"[\s\S]*orchestrateBankVerification/);
  assert.match(repository,/request\.kind==="change_employment"[\s\S]*applyEmploymentChange/);
  assert.match(repository,/\["deactivate","reactivate","archive"\][\s\S]*applyPartnerLifecycle/);
  assert.match(service,/BUSINESS_PARTNER_REQUEST_KIND_UNSUPPORTED/);
  assert.match(manifest,/^20260829_neon_business_partner_request_application_invariants\.sql$/m);
});

test("P1 application retries, stale targets, scope drift, and rollback share one boundary",async()=>{
  const [repository,service,migration]=await Promise.all([
    read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts"),
    read("../packages/services/master-data/src/business-partner-request-service.ts"),
    read("migrations/20260829_neon_business_partner_request_application_invariants.sql"),
  ]);
  assert.match(repository,/applicationResult\(input\.tenantId,input\.command\.requestId,input\.command\.idempotencyKey,input\.applicationFingerprint/);
  assert.match(repository,/status='applied' AND application_idempotency_key=\$\{idempotencyKey\} AND application_fingerprint=\$\{fingerprint\}/);
  assert.match(repository,/record_version\)!==request\.baseRecordVersion[\s\S]*BUSINESS_PARTNER_REQUEST_STALE_BASE_VERSION/);
  assert.match(repository,/BUSINESS_PARTNER_REQUEST_SCOPE_INCOMPATIBLE/);
  assert.match(repository,/BUSINESS_PARTNER_BANK_SCOPE_CHANGED/);
  assert.match(service,/options\.transactions\.run\("neon"[\s\S]*options\.repository\.apply[\s\S]*effects\(options/);
  assert.match(migration,/^BEGIN;/m);assert.match(migration,/COMMIT;/);
  assert.doesNotMatch(repository,/catch\s*\([^)]*\)[\s\S]{0,200}(failure|failed|ledger)/i);
});

test("P1 lifecycle and category correction preserve history",async()=>{
  const [migration,repository,masterFunctions]=await Promise.all([
    read("migrations/20260829_neon_business_partner_request_application_invariants.sql"),
    read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts"),
    read("ddl/planes/neon/master/07_functions.sql"),
  ]);
  assert.match(migration,/business_partner_request_lifecycle_impact_chk[\s\S]*dependencies[\s\S]*evidenceVersion[\s\S]*reasonCode/);
  assert.match(repository,/snapshotType:"business_partner\.lifecycle"[\s\S]*dependencyEvidence/);
  assert.match(repository,/UPDATE master\.work_assignment SET effective_until/);
  assert.match(repository,/UPDATE master\.employment SET termination_date/);
  assert.match(repository,/priorEmploymentId/);assert.match(repository,/priorAssignmentId/);
  assert.match(masterFunctions,/NEW\.partner_category IS DISTINCT FROM OLD\.partner_category/);
  assert.match(migration,/business_partner_duplicate_resolution[\s\S]*resolution_kind IN\('merge','rekey','supersede'\)/);
  assert.match(migration,/same-category partners/);
  assert.doesNotMatch(repository,/DELETE FROM master\.(business_partner|supplier|customer|person|employee|employment|work_assignment)/);
});

test("P1 change_bank only starts the dedicated verification authority",async()=>{
  const [repository,bankService,migration]=await Promise.all([
    read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts"),
    read("../packages/planes/neon/src/business-partner-account-bank-linkage.ts"),
    read("migrations/20260829_neon_business_partner_request_application_invariants.sql"),
  ]);
  const orchestration=repository.match(/async function orchestrateBankVerification[\s\S]*?\n}\n\nasync function applyEmploymentChange/)?.[0]??"";
  assert.match(orchestration,/INSERT INTO document\.business_partner_bank_verification/);
  assert.doesNotMatch(orchestration,/UPDATE master\.company_code_supplier_profile SET preferred_remittance_bank_link_id/);
  assert.match(bankService,/async applyVerification[\s\S]*UPDATE master\.company_code_supplier_profile SET preferred_remittance_bank_link_id/);
  assert.match(migration,/materialized_bank_verification_id[\s\S]*REFERENCES document\.business_partner_bank_verification/);
});
