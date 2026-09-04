import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("Step 1 seals Business Partner structural and lifecycle domains", async () => {
  const [domains, tables, functions, migration, manifest] = await Promise.all([
    read("ddl/planes/neon/master/02_domains.sql"),
    read("ddl/planes/neon/master/03_tables.sql"),
    read("ddl/planes/neon/master/07_functions.sql"),
    read("migrations/20260829_neon_business_partner_domain_hardening.sql"),
    read("migrations/manifests/neon.txt"),
  ]);
  assert.match(
    domains,
    /business_partner_category_d_check[\s\S]*organization[\s\S]*person[\s\S]*group/,
  );
  assert.match(
    domains,
    /business_partner_ownership_d[\s\S]*external[\s\S]*internal/,
  );
  assert.match(
    domains,
    /supplier_status_d_check[\s\S]*onboarding[\s\S]*suspended/,
  );
  assert.match(
    domains,
    /customer_status_d_check[\s\S]*prospect[\s\S]*suspended/,
  );
  assert.match(
    tables,
    /ownership_class\s+master\.business_partner_ownership_d\s+NOT NULL/,
  );
  assert.match(tables, /record_version\s+bigint\s+NOT NULL DEFAULT 1/);
  assert.match(functions, /SELECT partner\.ownership_class, partner\.status/);
  assert.match(migration, /Unmapped business_partner category values/);
  assert.match(
    migration,
    /ADD CONSTRAINT person_business_partner_required_chk CHECK\(business_partner_id IS NOT NULL\) NOT VALID/,
  );
  assert.match(
    manifest,
    /^20260829_neon_business_partner_domain_hardening\.sql$/m,
  );
});

test("Step 1 rejects retired legacy boundary values without weakening the sealed database", async () => {
  const [imports, ui] = await Promise.all([
    read("../packages/planes/neon/src/business-partner-import.ts"),
    read("../../packages/planes/neon/business-partner/src/index.tsx"),
  ]);
  assert.match(imports, /normalizePartnerStructure/);
  assert.doesNotMatch(imports, /individual[\s\S]*person/);
  assert.match(
    imports,
    /partner_category,ownership_class[\s\S]*'organization'/,
  );
  assert.doesNotMatch(imports, /partner_category=COALESCE/);
  assert.doesNotMatch(ui, /<option value="person">Person<\/option>/);
  assert.match(ui, /partnerCategory:"organization"/);
  assert.match(ui, /name="ownershipClass"/);
});

test("S2 decouples Person and moves workforce changes out of Business Partner authority", async () => {
  const [
    documentTables,
    documentConstraints,
    documentIndexes,
    documentFunctions,
    documentTriggers,
    documentRls,
    documentGrants,
    masterTables,
    masterConstraints,
    masterFunctions,
    masterTriggers,
    migration,
    manifest,
  ] = await Promise.all([
    read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/05_constraints.sql"),
    read("ddl/planes/neon/document/06_indexes.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),
    read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/10_rls.sql"),
    read("ddl/planes/neon/document/11_grants.sql"),
    read("ddl/planes/neon/master/03_tables.sql"),
    read("ddl/planes/neon/master/05_constraints.sql"),
    read("ddl/planes/neon/master/07_functions.sql"),
    read("ddl/planes/neon/master/08_triggers.sql"),
    read("migrations/20260902_neon_business_partner_organization_boundary.sql"),
    read("migrations/manifests/neon.txt"),
  ]);
  const personTable =
    masterTables.match(/CREATE TABLE master\.person \([\s\S]*?\n\);/)?.[0] ??
    "";
  assert.doesNotMatch(personTable, /business_partner_id/);
  assert.match(
    masterTables,
    /CREATE TABLE master\.person_business_partner_legacy_link/,
  );
  assert.match(
    masterConstraints,
    /business_partner_organization_only_chk[\s\S]*partner_category = 'organization'[\s\S]*NOT VALID/,
  );
  assert.doesNotMatch(
    masterFunctions,
    /trg_assert_active_person_business_partner|trg_validate_person_business_partner/,
  );
  assert.doesNotMatch(
    masterTriggers,
    /trg_business_partner_person_cardinality|trg_person_business_partner_cardinality/,
  );
  assert.match(
    masterFunctions,
    /trg_reject_person_business_partner_legacy_link_mutation/,
  );
  assert.match(documentTables, /CREATE TABLE document\.workforce_request/);
  assert.match(
    documentTables,
    /request_kind IN \('onboard_person', 'add_employment', 'change_employment', 'offboard_employment'\)/,
  );
  assert.match(documentTables, /protected_profile_content_item_id\s+uuid/);
  assert.match(
    documentConstraints,
    /business_partner_request_organization_boundary_chk[\s\S]*requested_role IS DISTINCT FROM 'workforce'/,
  );
  assert.match(
    documentConstraints,
    /workforce_request_(person|employee|employment)_fk/,
  );
  assert.match(documentIndexes, /workforce_request_open_target_kind_uq/);
  assert.match(
    documentFunctions,
    /fn_workforce_request_payload_has_restricted_key[\s\S]*nationalidentifier[\s\S]*compensation/,
  );
  assert.match(
    documentFunctions,
    /trg_guard_workforce_request[\s\S]*Invalid workforce request transition/,
  );
  assert.match(documentTriggers, /trg_workforce_request_15_guard/);
  assert.match(documentRls, /workforce_request[\s\S]*FORCE ROW LEVEL SECURITY/);
  assert.match(
    documentGrants,
    /REVOKE ALL ON document\.workforce_request FROM PUBLIC/,
  );
  assert.match(
    migration,
    /S2 blocked:[\s\S]*non-terminal workforce\/person Business Partner requests/,
  );
  assert.match(
    migration,
    /person_business_partner_legacy_link[\s\S]*DROP COLUMN business_partner_id/,
  );
  assert.doesNotMatch(
    migration,
    /DELETE FROM (?:master\.person|document\.business_partner_request)/,
  );
  assert.match(
    manifest,
    /^20260902_neon_business_partner_organization_boundary\.sql$/m,
  );
});

test("Step 1 hardens workforce contract identity and half-open primary ranges", async () => {
  const [
    tables,
    constraints,
    indexes,
    functions,
    triggers,
    migration,
    manifest,
  ] = await Promise.all([
    read("ddl/planes/neon/master/03_tables.sql"),
    read("ddl/planes/neon/master/05_constraints.sql"),
    read("ddl/planes/neon/master/06_indexes.sql"),
    read("ddl/planes/neon/master/07_functions.sql"),
    read("ddl/planes/neon/master/08_triggers.sql"),
    read("migrations/20260829_neon_workforce_effective_range_hardening.sql"),
    read("migrations/manifests/neon.txt"),
  ]);
  assert.match(tables, /is_primary\s+boolean\s+NOT NULL DEFAULT true/);
  assert.match(
    tables,
    /termination_date IS NULL OR termination_date > hire_date/,
  );
  assert.match(
    tables,
    /effective_until IS NULL OR effective_until > effective_from/,
  );
  assert.match(constraints, /employee_contract_identity_uq/);
  assert.match(constraints, /employment_employee_person_fk/);
  assert.match(constraints, /employment_company_legal_entity_fk/);
  assert.match(
    constraints,
    /employment_primary_effective_no_overlap[\s\S]*daterange\(hire_date[\s\S]*'\[\)'/,
  );
  assert.match(
    constraints,
    /work_assignment_primary_effective_no_overlap[\s\S]*daterange\(effective_from[\s\S]*'\[\)'/,
  );
  assert.doesNotMatch(
    indexes,
    /employment_one_active_fulltime_per_company_uq|work_assignment_one_primary_active_uq/,
  );
  assert.match(functions, /trg_validate_employment_contract/);
  assert.match(triggers, /CREATE TRIGGER trg_employment_contract/);
  assert.match(migration, /Employment company\/legal-entity mismatches/);
  assert.match(migration, /Overlapping active primary work assignments/);
  assert.match(
    manifest,
    /^20260829_neon_workforce_effective_range_hardening\.sql$/m,
  );
});
