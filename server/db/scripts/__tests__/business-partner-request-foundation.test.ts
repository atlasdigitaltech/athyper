import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const documentDdlRoot = resolve(import.meta.dirname, "../../ddl/planes/neon/document");
const databaseRoot = resolve(import.meta.dirname, "../..");

async function ddl(name: string): Promise<string> {
  return readFile(resolve(documentDdlRoot, name), "utf8");
}

test("Business Partner requests are source-neutral, bounded, and idempotent", async () => {
  const tables = await ddl("03_tables.sql");

  assert.match(tables, /CREATE TABLE document\.business_partner_request \(/);
  assert.match(tables, /source_kind IN \('manual', 'portal', 'mesh', 'import', 'api'\)/);
  assert.match(tables, /source_system_code = 'athyper_mesh'/);
  assert.match(tables, /business_partner_request_idempotency_uq UNIQUE \(tenant_id, idempotency_key\)/);
  assert.match(tables, /pg_column_size\(proposed_payload\) <= 1048576/);
  assert.match(tables, /approved_by IS DISTINCT FROM submitted_by/);
  assert.match(tables, /CREATE TABLE document\.business_partner_request_evidence \(/);
  assert.match(tables, /CREATE TABLE document\.business_partner_request_validation \(/);
  assert.doesNotMatch(tables, /raw_bank|account_id_value/);
});

test("Business Partner request relations are tenant-safe and append-only", async () => {
  const [constraints, triggers, rls, grants] = await Promise.all([
    ddl("05_constraints.sql"),
    ddl("08_triggers.sql"),
    ddl("10_rls.sql"),
    ddl("11_grants.sql"),
  ]);

  assert.match(constraints, /business_partner_request_target_fk[\s\S]*FOREIGN KEY \(tenant_id, target_business_partner_id\)/);
  assert.match(constraints, /business_partner_request_workflow_fk[\s\S]*REFERENCES document\.workflow_request\(tenant_id, id\)/);
  assert.match(constraints, /business_partner_request_evidence_request_fk[\s\S]*FOREIGN KEY \(tenant_id, request_id\)/);
  assert.match(triggers, /trg_business_partner_request_10_guard/);
  assert.match(triggers, /trg_business_partner_request_evidence_immutable/);
  assert.match(triggers, /trg_business_partner_request_validation_immutable/);
  for (const table of [
    "business_partner_request",
    "business_partner_request_evidence",
    "business_partner_request_validation",
  ]) {
    assert.match(rls, new RegExp(`ALTER TABLE document\\.${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.doesNotMatch(
    grants,
    /GRANT[\s\S]{0,80}DELETE[\s\S]{0,160}business_partner_request/,
  );
});

test("Business Partner request lifecycle locks reviewed payload and rejects invalid transitions", async () => {
  const functions = await ddl("07_functions.sql");
  const guard = functions.match(
    /CREATE OR REPLACE FUNCTION document\.trg_guard_business_partner_request\(\)[\s\S]*?\n\$\$;/,
  )?.[0];

  assert.ok(guard, "Business Partner request lifecycle guard must exist");
  assert.match(guard, /Submitted Business Partner request review coordinates and payload are immutable/);
  assert.match(guard, /New Business Partner requests must start as evidence-free drafts/);
  assert.match(guard, /WHEN 'pending_approval' THEN NEW\.status IN \('returned', 'approved', 'rejected', 'cancelled'\)/);
  assert.match(guard, /WHEN 'applying' THEN NEW\.status IN \('applied', 'failed'\)/);
  assert.match(guard, /Business Partner request approval evidence is immutable once recorded/);
  assert.match(guard, /Applied Business Partner request requires application evidence and materialized partner/);
  assert.doesNotMatch(
    functions.match(/CREATE OR REPLACE FUNCTION document\.trg_guard_planning_scenario\(\)[\s\S]*?\n\$\$;/)?.[0] ?? "",
    /Business Partner/,
  );
});

test("Business Partner workflow approver discovery crosses RLS only through a tenant-checked definer boundary",async()=>{const[functions,grants,migration,manifest]=await Promise.all([ddl("07_functions.sql"),ddl("11_grants.sql"),readFile(resolve(databaseRoot,"migrations/20260828_neon_business_partner_workflow_resolver.sql"),"utf8"),readFile(resolve(databaseRoot,"migrations/manifests/neon.txt"),"utf8")]);for(const source of[functions,migration]){assert.match(source,/fn_business_partner_request_approvers/);assert.match(source,/SECURITY DEFINER/);assert.match(source,/p_tenant_id IS DISTINCT FROM shared\.current_tenant_id\(\)/);assert.match(source,/business_partner_request\.decide/);assert.match(source,/member\.principal_id IS DISTINCT FROM p_excluded_principal_id/);assert.match(source,/NOT EXISTS[\s\S]*authz\.deny_rule/);assert.match(source,/LIMIT 200/);assert.match(source,/REVOKE ALL ON FUNCTION document\.fn_business_partner_request_approvers/);}assert.match(grants,/GRANT EXECUTE ON FUNCTION document\.fn_business_partner_request_approvers\(uuid, uuid, uuid, uuid\) TO athyperapp/);assert.match(manifest,/^20260828_neon_business_partner_workflow_resolver\.sql$/m);});

test("Phase 1B materialization persists complete immutable result coordinates",async()=>{const[tables,constraints,indexes,functions,migration,manifest]=await Promise.all([ddl("03_tables.sql"),ddl("05_constraints.sql"),ddl("06_indexes.sql"),ddl("07_functions.sql"),readFile(resolve(databaseRoot,"migrations/20260828_neon_business_partner_request_materializer.sql"),"utf8"),readFile(resolve(databaseRoot,"migrations/manifests/neon.txt"),"utf8")]);for(const column of["materialized_supplier_id","materialized_operating_organization_assignment_id","materialization_snapshot_id","application_idempotency_key","application_fingerprint"])assert.match(tables,new RegExp(column));assert.match(tables,/business_partner_request_materialization_evidence_chk/);assert.match(constraints,/business_partner_request_materialized_supplier_fk[\s\S]*REFERENCES master\.supplier/);assert.match(constraints,/business_partner_request_materialized_assignment_fk[\s\S]*business_partner_operating_organization_assignment/);assert.match(constraints,/business_partner_request_materialization_snapshot_fk[\s\S]*snapshot\.entity_snapshot_identity/);assert.match(indexes,/CREATE UNIQUE INDEX business_partner_request_application_key_uq/);assert.match(functions,/Business Partner request application evidence is immutable once recorded/);assert.match(functions,/NEW\.requested_role IN \('supplier',\s*'customer'\)/);assert.match(functions,/NEW\.requested_role\s*=\s*'workforce'/);assert.match(functions,/NEW\.materialized_work_assignment_id IS NOT NULL/);assert.match(migration,/current_database\(\) <> 'athyper_neon'/);assert.match(migration,/trg_guard_business_partner_request_materialization/);assert.match(migration,/REVOKE ALL ON FUNCTION document\.trg_guard_business_partner_request_materialization/);assert.match(manifest,/^20260828_neon_business_partner_request_materializer\.sql$/m);});

test("the forward migration is NEON-only and preserves the canonical safety contract", async () => {
  const [migration, neonManifest, meshManifest, studioManifest] = await Promise.all([
    readFile(resolve(databaseRoot, "migrations/20260828_neon_business_partner_request_foundation.sql"), "utf8"),
    readFile(resolve(databaseRoot, "migrations/manifests/neon.txt"), "utf8"),
    readFile(resolve(databaseRoot, "migrations/manifests/mesh.txt"), "utf8"),
    readFile(resolve(databaseRoot, "migrations/manifests/studio.txt"), "utf8"),
  ]);

  assert.match(neonManifest, /^20260828_neon_business_partner_request_foundation\.sql$/m);
  assert.doesNotMatch(meshManifest, /neon_business_partner_request_foundation/);
  assert.doesNotMatch(studioManifest, /neon_business_partner_request_foundation/);
  assert.match(migration, /current_database\(\) <> 'athyper_neon'/);
  assert.match(migration, /CREATE TABLE document\.business_partner_request \(/);
  assert.match(migration, /CREATE TRIGGER trg_business_partner_request_10_guard/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE ON document\.business_partner_request/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY seed_write ON document\.business_partner_request/);
  assert.match(migration, /REVOKE ALL ON document\.business_partner_request/);
  assert.doesNotMatch(migration, /GRANT[^;]*DELETE[^;]*business_partner_request/i);
});
