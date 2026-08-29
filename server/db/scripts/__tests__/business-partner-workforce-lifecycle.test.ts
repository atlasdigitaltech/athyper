import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("P2 binds one onboarding case to each applied workforce-creation request",async()=>{
  const[migration,repository,contracts,manifest]=await Promise.all([read("migrations/20260829_neon_workforce_lifecycle.sql"),read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts"),read("../packages/contracts/master-data/src/workforce.ts"),read("migrations/manifests/neon.txt")]);
  assert.match(migration,/onboarding_case_request_uq UNIQUE\(tenant_id,business_partner_request_id\)/);
  assert.match(migration,/application_result_kind='workforce_created'/);
  assert.match(migration,/business_partner_request_workforce_onboarding_chk/);
  assert.match(migration,/Applied workforce onboarding binding is immutable/);
  assert.match(repository,/INSERT INTO document\.onboarding_case/);
  assert.match(repository,/materialized_onboarding_case_id=/);
  assert.match(contracts,/WorkforceChecklistItem/);
  assert.match(manifest,/^20260829_neon_workforce_lifecycle\.sql$/m);
});

test("P2 preserves effective history and fails closed on workforce scope",async()=>{
  const[rangeMigration,lifecycleMigration,repository]=await Promise.all([read("migrations/20260829_neon_workforce_effective_range_hardening.sql"),read("migrations/20260829_neon_workforce_lifecycle.sql"),read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts")]);
  assert.match(rangeMigration,/employment_primary_effective_no_overlap EXCLUDE USING gist/);
  assert.match(rangeMigration,/work_assignment_primary_effective_no_overlap EXCLUDE USING gist/);
  assert.match(repository,/SET termination_date=\$\{effectiveFrom\}::date[\s\S]*INSERT INTO master\.employment/);
  assert.match(repository,/SET effective_until=\$\{effectiveFrom\}::date[\s\S]*INSERT INTO master\.work_assignment/);
  assert.match(repository,/manager_assignment\.tenant_id=company\.tenant_id/);
  assert.match(repository,/manager_assignment\.company_code_id=company\.id/);
  assert.match(lifecycleMigration,/Work assignment position is incompatible with company or organization unit/);
  assert.match(lifecycleMigration,/Work assignment manager is not effective in the assigned company/);
});

test("P2 separates IAM, restricted evidence, and offboarding concerns",async()=>{
  const[migration,service,routes,boundary]=await Promise.all([read("migrations/20260829_neon_workforce_lifecycle.sql"),read("../packages/services/master-data/src/workforce-service.ts"),read("../packages/services/master-data/src/workforce-routes.ts"),read("../packages/services/master-data/src/business-partner-request-service.ts")]);
  assert.match(migration,/workforce_iam_projection_employee_uq UNIQUE\(tenant_id,employee_id\)/);
  assert.match(migration,/HR materialization commits independently/);
  assert.match(migration,/person_sensitive_access_audit[\s\S]*requested_fields[\s\S]*redacted_fields[\s\S]*expires_at/);
  assert.match(migration,/person_sensitive_access_audit_immutable/);
  assert.match(migration,/employment_terminated_at[\s\S]*resource_checklist_completed_at[\s\S]*access_deprovision_status/);
  assert.match(service,/requests\.create\([\s\S]*kind:"new_partner"[\s\S]*requestedRole:"workforce"/);
  assert.match(routes,/workforce-source-adapters\/:source/);
  assert.match(routes,/restricted-evidence\/read/);
  assert.match(boundary,/MESH cannot originate workforce or person materialization/);
  assert.match(boundary,/Generic Business Partner and commercial payloads cannot contain workforce or restricted person fields/);
});
