import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("S2 preserves historical onboarding evidence and moves new request intake to workforce authority", async () => {
  const [migration, boundaryMigration, repository, workforceRepository, contracts, manifest] = await Promise.all([
    read("migrations/20260829_neon_workforce_lifecycle.sql"),
    read("migrations/20260902_neon_business_partner_organization_boundary.sql"),
    read(
      "../packages/services/master-data/src/kysely-business-partner-request-repository.ts",
    ),
    read("../packages/services/master-data/src/kysely-workforce-request-repository.ts"),
    read("../packages/contracts/master-data/src/workforce.ts"),
    read("migrations/manifests/neon.txt"),
  ]);
  assert.match(
    migration,
    /onboarding_case_request_uq UNIQUE\(tenant_id,business_partner_request_id\)/,
  );
  assert.match(migration, /application_result_kind='workforce_created'/);
  assert.match(migration, /business_partner_request_workforce_onboarding_chk/);
  assert.match(migration, /Applied workforce onboarding binding is immutable/);
  assert.match(boundaryMigration, /CREATE TABLE document\.workforce_request/);
  assert.match(boundaryMigration, /materialized_onboarding_case_id/);
  assert.match(workforceRepository, /INSERT INTO document\.workforce_request/);
  assert.doesNotMatch(repository, /INSERT INTO document\.onboarding_case/);
  assert.match(contracts, /WorkforceChecklistItem/);
  assert.match(manifest, /^20260829_neon_workforce_lifecycle\.sql$/m);
});

test("P2 preserves workforce effective-range integrity outside Business Partner authority", async () => {
  const [rangeMigration, lifecycleMigration, repository, workforceService] = await Promise.all([
    read("migrations/20260829_neon_workforce_effective_range_hardening.sql"),
    read("migrations/20260829_neon_workforce_lifecycle.sql"),
    read(
      "../packages/services/master-data/src/kysely-business-partner-request-repository.ts",
    ),
    read("../packages/services/master-data/src/workforce-service.ts"),
  ]);
  assert.match(
    rangeMigration,
    /employment_primary_effective_no_overlap EXCLUDE USING gist/,
  );
  assert.match(
    rangeMigration,
    /work_assignment_primary_effective_no_overlap EXCLUDE USING gist/,
  );
  assert.doesNotMatch(repository, /applyEmploymentChange|person\.business_partner_id/);
  assert.match(workforceService, /kind==="change_employment"/);
  assert.match(workforceService, /targetPersonId/);
  assert.match(workforceService, /targetEmployeeId/);
  assert.match(workforceService, /targetEmploymentId/);
  assert.match(
    lifecycleMigration,
    /Work assignment position is incompatible with company or organization unit/,
  );
  assert.match(
    lifecycleMigration,
    /Work assignment manager is not effective in the assigned company/,
  );
});

test("P2 separates IAM, restricted evidence, and offboarding concerns", async () => {
  const [migration, service, routes, boundary] = await Promise.all([
    read("migrations/20260829_neon_workforce_lifecycle.sql"),
    read("../packages/services/master-data/src/workforce-service.ts"),
    read("../packages/services/master-data/src/workforce-routes.ts"),
    read(
      "../packages/services/master-data/src/business-partner-request-service.ts",
    ),
  ]);
  assert.match(
    migration,
    /workforce_iam_projection_employee_uq UNIQUE\(tenant_id,employee_id\)/,
  );
  assert.match(migration, /HR materialization commits independently/);
  assert.match(
    migration,
    /person_sensitive_access_audit[\s\S]*requested_fields[\s\S]*redacted_fields[\s\S]*expires_at/,
  );
  assert.match(migration, /person_sensitive_access_audit_immutable/);
  assert.match(
    migration,
    /employment_terminated_at[\s\S]*resource_checklist_completed_at[\s\S]*access_deprovision_status/,
  );
  assert.match(service, /createRequest\([\s\S]*kind:"onboard_person"/);
  assert.match(service, /requestRepository\.create/);
  assert.doesNotMatch(
    service,
    /requests\.create\([\s\S]*requestedRole:"workforce"/,
  );
  assert.match(routes, /workforce-source-adapters\/:source/);
  assert.match(routes, /restricted-evidence\/read/);
  assert.doesNotMatch(boundary, /requestedRole==="workforce"/);
  assert.doesNotMatch(boundary, /kind==="add_workforce"/);
  assert.match(
    boundary,
    /Generic Business Partner and commercial payloads cannot contain workforce or restricted person fields/,
  );
});
