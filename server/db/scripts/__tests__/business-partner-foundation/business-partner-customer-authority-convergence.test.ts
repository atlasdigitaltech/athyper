import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("S3 removes duplicate Customer designation and credit-limit columns", async () => {
  const [master, control, migration, manifest] = await Promise.all([
    read("ddl/planes/neon/master/03_tables.sql"),
    read("ddl/planes/neon/control/03_tables.sql"),
    read("migrations/20260902_neon_customer_authority_convergence.sql"),
    read("migrations/manifests/neon.txt"),
  ]);
  const customer = master.match(/CREATE TABLE master\.customer \([\s\S]*?\n\);/)?.[0] ?? "";
  const profile = master.match(/CREATE TABLE master\.company_code_customer_profile \([\s\S]*?\n\);/)?.[0] ?? "";
  assert.doesNotMatch(customer, /is_key_account/);
  assert.doesNotMatch(profile, /credit_limit/);
  assert.match(control, /approved_credit_limit\s+numeric\(20,4\)/);
  assert.match(control, /approved_currency_code\s+character\(3\)/);
  assert.match(migration, /MIGRATED_FROM_CUSTOMER_IS_KEY_ACCOUNT/);
  assert.match(migration, /MIGRATED_FROM_COMPANY_CODE_CUSTOMER_PROFILE/);
  assert.match(manifest, /^20260902_neon_customer_authority_convergence\.sql$/m);
});

test("S3 exposes only governed read models and guards effective credit outcomes", async () => {
  const [functions, triggers, views, repository, validator] = await Promise.all([
    read("ddl/planes/neon/control/07_functions.sql"),
    read("ddl/planes/neon/control/08_triggers.sql"),
    read("ddl/planes/neon/control/09_views.sql"),
    read("../packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts"),
    read("../packages/services/master-data/src/business-partner-request-validator.ts"),
  ]);
  assert.match(functions, /trg_guard_customer_credit_review/);
  assert.match(functions, /Overlapping approved customer credit outcome exists/);
  assert.match(triggers, /trg_customer_credit_review_10_scope/);
  assert.match(triggers, /trg_customer_credit_review_20_guard/);
  assert.match(views, /CREATE VIEW control\.current_customer_account_designation/);
  assert.match(views, /CREATE VIEW control\.current_customer_credit_limit/);
  assert.match(repository, /approved_credit_limit/);
  assert.match(repository, /requested_currency_code/);
  assert.doesNotMatch(repository, /company_code_customer_profile[^`]*credit_limit/);
  assert.match(validator, /customer\.authority_fields\.prohibited/);
});

test("S3 makes the Customer lifecycle ledger the exclusive status command authority", async () => {
  const [tables, controlFunctions, masterFunctions, triggers, grants, repository, migration, manifest] = await Promise.all([
    read("ddl/planes/neon/control/03_tables.sql"),
    read("ddl/planes/neon/control/07_functions.sql"),
    read("ddl/planes/neon/master/07_functions.sql"),
    read("ddl/planes/neon/master/08_triggers.sql"),
    read("ddl/planes/neon/control/11_grants.sql"),
    read("../packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts"),
    read("migrations/20260903_neon_customer_lifecycle_command_authority.sql"),
    read("migrations/manifests/neon.txt"),
  ]);
  assert.match(tables, /business_date\s+date\s+NOT NULL/);
  assert.match(tables, /command_fingerprint\s+text\s+NOT NULL/);
  assert.match(controlFunctions, /SECURITY DEFINER[\s\S]*?command_customer_lifecycle|command_customer_lifecycle[\s\S]*?SECURITY DEFINER/);
  assert.match(controlFunctions, /Customer activation requires matching eligible readiness evidence/);
  assert.match(masterFunctions, /trg_guard_customer_lifecycle_authority/);
  assert.match(masterFunctions, /New Customer roles must start as evidence-free prospects/);
  assert.match(masterFunctions, /status may only change through control\.command_customer_lifecycle/);
  assert.match(triggers, /trg_customer_08_lifecycle_initial/);
  assert.match(triggers, /trg_customer_09_lifecycle_authority/);
  assert.match(grants, /GRANT SELECT ON control\.customer_lifecycle_event TO athyperapp/);
  assert.doesNotMatch(grants, /GRANT SELECT,INSERT ON control\.customer_lifecycle_event TO athyperapp/);
  assert.match(repository, /FROM control\.command_customer_lifecycle/);
  assert.doesNotMatch(repository, /UPDATE master\.customer SET status/);
  assert.match(migration, /S3 preflight: activation lifecycle history lacks pinned eligible readiness evidence/);
  assert.match(manifest, /^20260903_neon_customer_lifecycle_command_authority\.sql$/m);
});
