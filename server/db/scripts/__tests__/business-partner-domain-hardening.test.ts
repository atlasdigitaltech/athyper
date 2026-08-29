import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("Step 1 seals Business Partner structural and lifecycle domains",async()=>{
  const[domains,tables,functions,migration,manifest]=await Promise.all([
    read("ddl/planes/neon/master/02_domains.sql"),read("ddl/planes/neon/master/03_tables.sql"),
    read("ddl/planes/neon/master/07_functions.sql"),read("migrations/20260829_neon_business_partner_domain_hardening.sql"),
    read("migrations/manifests/neon.txt")]);
  assert.match(domains,/business_partner_category_d_check[\s\S]*organization[\s\S]*person[\s\S]*group/);
  assert.match(domains,/business_partner_ownership_d[\s\S]*external[\s\S]*internal/);
  assert.match(domains,/supplier_status_d_check[\s\S]*onboarding[\s\S]*suspended/);
  assert.match(domains,/customer_status_d_check[\s\S]*prospect[\s\S]*suspended/);
  assert.match(tables,/ownership_class\s+master\.business_partner_ownership_d\s+NOT NULL/);
  assert.match(tables,/record_version\s+bigint\s+NOT NULL DEFAULT 1/);
  assert.match(functions,/SELECT partner\.ownership_class, partner\.status/);
  assert.match(migration,/Unmapped business_partner category values/);
  assert.match(migration,/ADD CONSTRAINT person_business_partner_required_chk CHECK\(business_partner_id IS NOT NULL\) NOT VALID/);
  assert.match(manifest,/^20260829_neon_business_partner_domain_hardening\.sql$/m);
});

test("Step 1 maps legacy boundary values without weakening the sealed database",async()=>{
  const[requests,imports,ui]=await Promise.all([
    read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts"),
    read("../packages/planes/neon/src/business-partner-import.ts"),
    read("../../packages/planes/neon/business-partner/src/index.tsx")]);
  assert.match(requests,/requestedCategory==="individual"\?"person"/);
  assert.match(requests,/ownershipClass[\s\S]*business_partner_ownership_d/);
  assert.match(imports,/normalizePartnerStructure/);
  assert.doesNotMatch(imports,/partner_category=COALESCE/);
  assert.doesNotMatch(ui,/<option value="person">Person<\/option>/);
  assert.match(ui,/partnerCategory:"organization"/);
  assert.match(ui,/name="ownershipClass"/);
});

test("Step 1 materializes governed workforce Person onboarding and seals the legacy cutover",async()=>{
  const[documentDomains,documentTables,documentConstraints,documentFunctions,masterTables,masterFunctions,masterTriggers,contracts,routes,service,validator,repository,client,ui,migration,manifest]=await Promise.all([
    read("ddl/planes/neon/document/02_domains.sql"),read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/05_constraints.sql"),read("ddl/planes/neon/document/07_functions.sql"),
    read("ddl/planes/neon/master/03_tables.sql"),read("ddl/planes/neon/master/07_functions.sql"),
    read("ddl/planes/neon/master/08_triggers.sql"),read("../packages/contracts/master-data/src/business-partner-requests.ts"),
    read("../packages/services/master-data/src/business-partner-request-routes.ts"),read("../packages/services/master-data/src/business-partner-request-service.ts"),
    read("../packages/services/master-data/src/business-partner-request-validator.ts"),read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts"),
    read("../../packages/planes/neon/business-partner/src/client.ts"),read("../../packages/planes/neon/business-partner/src/index.tsx"),
    read("migrations/20260829_neon_person_workforce_onboarding.sql"),read("migrations/manifests/neon.txt")]);
  assert.match(documentDomains,/business_partner_requested_role_d[\s\S]*supplier[\s\S]*customer[\s\S]*workforce/);
  assert.match(documentDomains,/business_partner_request_kind_d[\s\S]*add_workforce[\s\S]*change_employment/);
  assert.match(documentTables,/legal_entity_id\s+uuid/);
  assert.match(documentTables,/materialized_work_assignment_id\s+uuid/);
  assert.match(documentConstraints,/business_partner_request_materialized_person_fk/);
  assert.match(documentFunctions,/requested_role='workforce'/);
  assert.match(masterTables,/business_partner_id\s+uuid\s+NOT NULL/);
  assert.match(masterFunctions,/trg_assert_active_person_business_partner/);
  assert.match(masterTriggers,/trg_business_partner_person_cardinality/);
  assert.match(contracts,/"supplier" \| "customer" \| "workforce"/);
  assert.match(routes,/add_workforce/);
  assert.match(service,/workforce onboarding requires legalEntityId, companyCodeId, and orgUnitId/i);
  assert.match(validator,/workforce\.identity\.required/);
  assert.match(repository,/applyWorkforceOnboarding/);
  assert.match(repository,/INSERT INTO master\.work_assignment/);
  assert.match(repository,/operating_organization_company_assignment company_scope/);
  assert.match(client,/onboardWorkforce/);
  assert.match(ui,/NewWorkforcePersonRequest/);
  assert.match(migration,/ALTER COLUMN business_partner_id SET NOT NULL/);
  assert.match(migration,/Active person-category Business Partners do not have exactly one Person profile/);
  assert.match(manifest,/^20260829_neon_person_workforce_onboarding\.sql$/m);
});

test("Step 1 hardens workforce contract identity and half-open primary ranges",async()=>{
  const[tables,constraints,indexes,functions,triggers,migration,manifest]=await Promise.all([
    read("ddl/planes/neon/master/03_tables.sql"),read("ddl/planes/neon/master/05_constraints.sql"),
    read("ddl/planes/neon/master/06_indexes.sql"),read("ddl/planes/neon/master/07_functions.sql"),
    read("ddl/planes/neon/master/08_triggers.sql"),read("migrations/20260829_neon_workforce_effective_range_hardening.sql"),
    read("migrations/manifests/neon.txt")]);
  assert.match(tables,/is_primary\s+boolean\s+NOT NULL DEFAULT true/);
  assert.match(tables,/termination_date IS NULL OR termination_date > hire_date/);
  assert.match(tables,/effective_until IS NULL OR effective_until > effective_from/);
  assert.match(constraints,/employee_contract_identity_uq/);
  assert.match(constraints,/employment_employee_person_fk/);
  assert.match(constraints,/employment_company_legal_entity_fk/);
  assert.match(constraints,/employment_primary_effective_no_overlap[\s\S]*daterange\(hire_date[\s\S]*'\[\)'/);
  assert.match(constraints,/work_assignment_primary_effective_no_overlap[\s\S]*daterange\(effective_from[\s\S]*'\[\)'/);
  assert.doesNotMatch(indexes,/employment_one_active_fulltime_per_company_uq|work_assignment_one_primary_active_uq/);
  assert.match(functions,/trg_validate_employment_contract/);
  assert.match(triggers,/CREATE TRIGGER trg_employment_contract/);
  assert.match(migration,/Employment company\/legal-entity mismatches/);
  assert.match(migration,/Overlapping active primary work assignments/);
  assert.match(manifest,/^20260829_neon_workforce_effective_range_hardening\.sql$/m);
});
