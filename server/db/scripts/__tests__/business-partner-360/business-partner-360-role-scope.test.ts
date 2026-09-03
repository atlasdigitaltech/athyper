import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");
const contains = (source: string, values: readonly string[]) => {
  for (const value of values)
    assert.ok(source.includes(value), `missing ${value}`);
};

test("BS360 role and scope reads use the canonical organization model", async () => {
  const [repository, sections] = await Promise.all([
    read(
      "packages/services/master-data/src/kysely-business-partner-360-repository.ts",
    ),
    read(
      "packages/services/master-data/src/kysely-business-partner-360-role-sections.ts",
    ),
  ]);

  contains(repository, [
    "master.operating_organization_company_assignment",
    "master.legal_entity_internal_partner_link",
    "input.operatingOrganizationId",
    "input.companyCodeId",
    "input.legalEntityId",
    "input.roleLens",
  ]);
  contains(sections, [
    "master.supplier",
    "master.customer",
    "master.business_partner_operating_organization_assignment",
    "master.company_code_supplier_profile",
    "master.company_code_customer_profile",
    "master.legal_entity_internal_partner_link",
  ]);
  assert.doesNotMatch(
    `${repository}${sections}`,
    /master\.legal_entity_business_partner_link/,
  );
});

test("BS360 keeps supplier and customer company configuration separate", async () => {
  const source = await read(
    "packages/services/master-data/src/kysely-business-partner-360-role-sections.ts",
  );

  contains(source, [
    "async function supplier",
    "assignment.partner_role='supplier'",
    "preferred_remittance_bank_link_id",
    "async function customer",
    "assignment.partner_role='customer'",
    "statement_cycle_code",
    "effective_from<=${input.asOf}::date",
  ]);
});

test("canonical DDL separates internal partner identity from customer designation", async () => {
  const [
    master,
    views,
    domains,
    control,
    constraints,
    indexes,
    functions,
    triggers,
    rls,
    grants,
    manifest,
  ] = await Promise.all([
    read("db/ddl/planes/neon/master/03_tables.sql"),
    read("db/ddl/planes/neon/master/09_views.sql"),
    read("db/ddl/planes/neon/control/02_domains.sql"),
    read("db/ddl/planes/neon/control/03_tables.sql"),
    read("db/ddl/planes/neon/control/05_constraints.sql"),
    read("db/ddl/planes/neon/control/06_indexes.sql"),
    read("db/ddl/planes/neon/control/07_functions.sql"),
    read("db/ddl/planes/neon/control/08_triggers.sql"),
    read("db/ddl/planes/neon/control/10_rls.sql"),
    read("db/ddl/planes/neon/control/11_grants.sql"),
    read("db/migrations/manifests/neon.txt"),
  ]);

  assert.match(
    master,
    /CREATE TABLE master\.legal_entity_internal_partner_link/,
  );
  assert.doesNotMatch(
    master,
    /CREATE TABLE master\.legal_entity_business_partner_link/,
  );
  assert.match(views, /CREATE VIEW master\.legal_entity_business_partner_link/);

  contains(domains, ["key_account", "strategic", "priority_service"]);
  assert.match(control, /CREATE TABLE control\.customer_account_designation/);
  contains(constraints, [
    "customer_account_designation_partner_fk",
    "customer_account_designation_customer_fk",
    "customer_account_designation_org_fk",
    "customer_account_designation_company_fk",
  ]);
  contains(indexes, [
    "customer_account_designation_idempotency_uq",
    "customer_account_designation_resolution_idx",
  ]);
  contains(functions, [
    "Customer does not belong to the selected business partner",
    "Overlapping approved customer account designation scope exists",
  ]);
  contains(triggers, [
    "trg_customer_account_designation_10_scope",
    "trg_customer_account_designation_20_guard",
  ]);
  assert.match(
    rls,
    /ALTER TABLE control\.customer_account_designation FORCE ROW LEVEL SECURITY/,
  );
  assert.match(
    grants,
    /REVOKE ALL ON[\s\S]*control\.customer_account_designation[\s\S]*FROM PUBLIC/,
  );
  assert.match(
    manifest,
    /^20260902_neon_internal_partner_and_customer_designation\.sql$/m,
  );
});

test("BS360 exposes governed maintenance actions without owning eligibility", async () => {
  const [shell, component, client] = await Promise.all([
    read(
      "../packages/planes/neon/business-partner/src/360/business-partner-360.tsx",
    ),
    read(
      "../packages/planes/neon/business-partner/src/360/components/role-company-sections.tsx",
    ),
    read(
      "../packages/planes/neon/business-partner/src/360/business-partner-360-role-client.ts",
    ),
  ]);

  assert.doesNotMatch(`${shell}${component}${client}`, /eligibility/i);
  contains(component, [
    "roles/new",
    "scope/new?kind=assign_organization",
    "kind=configure_company",
  ]);
  contains(client, [
    "operatingOrganizationId",
    "companyCodeId",
    "legalEntityId",
  ]);
});
