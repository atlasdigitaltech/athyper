import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("external workforce remains distinct from buyer employment", async () => {
  const [master, documents, constraints] = await Promise.all([
    read("ddl/planes/neon/master/03_tables.sql"),
    read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/05_constraints.sql"),
  ]);

  assert.match(master, /CREATE TABLE master\.external_worker/);
  assert.match(
    master,
    /external_worker_person_uq UNIQUE \(tenant_id, person_id\)/,
  );
  assert.doesNotMatch(
    master.match(
      /CREATE TABLE master\.external_worker[\s\S]*?COMMENT ON TABLE master\.external_worker/,
    )?.[0] ?? "",
    /employee_id|employment_id|supplier_id/,
  );
  assert.match(documents, /CREATE TABLE document\.worker_engagement/);
  assert.match(
    documents,
    /num_nonnulls\(contingent_work_order_id, statement_of_work_id\) = 1/,
  );
  assert.match(
    documents,
    /CREATE TABLE document\.worker_operational_placement/,
  );
  assert.doesNotMatch(
    documents.match(
      /CREATE TABLE document\.worker_operational_placement[\s\S]*?COMMENT ON TABLE document\.worker_operational_placement/,
    )?.[0] ?? "",
    /work_assignment_id/,
  );
  assert.match(
    constraints,
    /worker_engagement_external_worker_fk[\s\S]*REFERENCES master\.external_worker/,
  );
});

test("external workforce covers sourcing through accepted AP allocation", async () => {
  const [
    control,
    documents,
    constraints,
    functions,
    triggers,
    rls,
    grants,
    migration,
    manifest,
  ] = await Promise.all([
    read("ddl/planes/neon/control/03_tables.sql"),
    read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/05_constraints.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),
    read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/10_rls.sql"),
    read("ddl/planes/neon/document/11_grants.sql"),
    read(
      "migrations/20260830_neon_external_workforce_services_procurement.sql",
    ),
    read("migrations/manifests/neon.txt"),
  ]);

  for (const name of [
    "external_workforce_rate_card",
    "external_workforce_rate",
  ]) {
    assert.match(control, new RegExp(`CREATE TABLE control\\.${name}`));
  }
  for (const name of [
    "workforce_requisition",
    "workforce_requisition_supplier",
    "external_candidate_submission",
    "external_candidate_evaluation",
    "contingent_work_order",
    "contingent_work_order_revision",
    "statement_of_work",
    "statement_of_work_revision",
    "statement_of_work_item",
    "worker_engagement",
    "worker_operational_placement",
    "worker_compliance_item",
    "engagement_onboarding_case",
    "external_time_sheet",
    "external_time_entry",
    "external_expense_sheet",
    "external_expense_item",
    "external_service_entry",
    "external_service_entry_line",
    "external_workforce_invoice_allocation",
  ]) {
    assert.match(documents, new RegExp(`CREATE TABLE document\\.${name}`));
    assert.match(rls, new RegExp(`['\"]?${name}['\"]?`));
    assert.match(grants, new RegExp(`document\\.${name}`));
  }
  assert.match(
    constraints,
    /external_workforce_invoice_allocation_invoice_line_fk[\s\S]*purchase_invoice_line/,
  );
  assert.match(functions, /Candidate submission must use an open distribution/);
  assert.match(
    functions,
    /Worker engagement supplier, buyer company, legal entity and source contract must agree/,
  );
  assert.match(triggers, /external_candidate_evaluation_immutable/);
  assert.match(triggers, /external_workforce_invoice_allocation_immutable/);
  assert.match(
    migration,
    /External workforce and services procurement migration requires the NEON plane/,
  );
  assert.match(migration, /CREATE TABLE master\.external_worker/);
  assert.match(migration, /CREATE TABLE document\.worker_engagement/);
  assert.match(migration, /CREATE TABLE document\.external_service_entry/);
  assert.match(
    manifest,
    /^20260830_neon_external_workforce_services_procurement\.sql$/m,
  );
});
