import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("NEON owns claim intake, canonical service acceptance, reconciliation and invoice binding", async () => {
  const [control, tables, functions, triggers, view, grants, migration, manifest, service, repository] = await Promise.all([
    read("ddl/planes/neon/control/03_tables.sql"), read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/07_functions.sql"), read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/09_views.sql"), read("ddl/planes/neon/document/11_grants.sql"),
    read("migrations/20260830_neon_external_workforce_mesh_claim_bridge.sql"), read("migrations/manifests/neon.txt"),
    read("../packages/services/finance/src/external-workforce/service-sheet-source-service.ts"),
    read("../packages/services/finance/src/external-workforce/kysely-service-sheet-source-repository.ts"),
  ]);
  assert.match(control, /CREATE TABLE control\.mesh_workforce_claim_inbox/);
  assert.match(control, /CREATE TABLE control\.mesh_workforce_claim_processing_attempt/);
  assert.match(tables, /source_inbox_id/);
  assert.match(tables, /CREATE TABLE document\.service_sheet_source_allocation/);
  assert.match(functions, /External claim line identity and parent are immutable/);
  assert.match(functions, /Invoice service-sheet source must identify an accepted canonical line/);
  assert.match(triggers, /trg_external_service_entry_deprecated_write/);
  assert.match(view, /CREATE OR REPLACE VIEW document\.external_claim_reconciliation_v/);
  assert.match(view, /source_entity_type = 'document\.service_sheet'/);
  assert.doesNotMatch(grants, /GRANT SELECT,INSERT,UPDATE,DELETE ON[\s\S]{0,120}document\.external_service_entry/);
  assert.match(migration, /Legacy external service-entry backfill/);
  assert.match(migration, /DO \$reconcile\$/);
  assert.match(manifest, /^20260830_neon_external_workforce_mesh_claim_bridge\.sql$/m);
  assert.match(service, /never writes the deprecated external_service_entry tables/);
  assert.match(repository, /INSERT INTO document\.service_sheet_source_allocation/);
  assert.doesNotMatch(repository, /external_service_entry/);
});

test("MESH owns document publications, delivery governance and only a participant-safe projection", async () => {
  const [tables, functions, rls, migration, manifest] = await Promise.all([
    read("ddl/planes/mesh/mesh/03_tables.sql"), read("ddl/planes/mesh/control/07_functions.sql"),
    read("ddl/planes/mesh/mesh/10_rls.sql"), read("migrations/20260830_mesh_external_workforce_exchange.sql"),
    read("migrations/manifests/mesh.txt"),
  ]);
  assert.match(tables, /CREATE TABLE mesh\.document_business_status_projection/);
  for (const forbidden of ["worker_name", "receipt_content", "cost_center_id", "gl_account_id", "bill_rate"]) {
    assert.doesNotMatch(tables.match(/CREATE TABLE mesh\.document_business_status_projection[\s\S]*?COMMENT ON TABLE/)?.[0] ?? "", new RegExp(forbidden));
  }
  assert.match(functions, /fn_provision_external_workforce_exchange/);
  assert.match(functions, /external_time_sheet\.submit\.v1/);
  assert.match(functions, /supplier_invoice\.submit\.v1/);
  assert.match(functions, /external_workforce\.claim\.inbound/);
  assert.match(rls, /document_business_status_projection[\s\S]*sender_tenant_id,e\.receiver_tenant_id/);
  assert.match(migration, /Published global Entity contract/);
  assert.match(manifest, /^20260830_mesh_external_workforce_exchange\.sql$/m);
});
