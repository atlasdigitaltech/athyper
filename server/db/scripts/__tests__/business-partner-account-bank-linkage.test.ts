import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("WP15 MESH disclosure is directional, approved, immutable and masked", async () => {
  const [tables, snapshots, functions, rls, migration, manifest] = await Promise.all([
    read("ddl/planes/mesh/mesh/03_tables.sql"),
    read("ddl/planes/mesh/snapshot/03_tables.sql"),
    read("ddl/planes/mesh/mesh/07_functions.sql"),
    read("ddl/planes/mesh/snapshot/10_rls.sql"),
    read("migrations/20260828_mesh_business_partner_account_bank_linkage.sql"),
    read("migrations/manifests/mesh.txt"),
  ]);
  for (const value of ["network_relationship_id", "recipient_tenant_id", "recipient_account_id", "decision_fingerprint", "secure_retrieval_reference"]) assert.match(tables, new RegExp(value));
  assert.match(snapshots, /field_set_code[\s\S]*masked_retrieval_v1/);
  assert.match(snapshots, /bank_account_disclosure_snapshot_safe_chk/);
  assert.doesNotMatch(snapshots, /account_id_value/);
  assert.match(functions, /requires independent approval/);
  assert.match(rls, /bank_disclosure_snapshot_participant_read/);
  assert.match(migration, /current_database\(\)<>'athyper_mesh'/);
  assert.match(migration, /mesh\.bank_disclosure\.decide/);
  const service = await read("../packages/planes/mesh/src/business-partner-bank-disclosure.ts");
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /status='superseded'/);
  assert.match(service, /mesh\.bank_account\.changed/);
  assert.match(manifest, /^20260828_mesh_business_partner_account_bank_linkage\.sql$/m);
});

test("WP15 NEON separates account mapping, masked projection, verification and application", async () => {
  const [control, document, snapshot, functions, migration, guards, manifest] = await Promise.all([
    read("ddl/planes/neon/control/03_tables.sql"),
    read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/snapshot/03_tables.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),
    read("migrations/20260828_neon_business_partner_account_bank_linkage.sql"),
    read("migrations/20260828_neon_business_partner_account_bank_linkage_guards.sql"),
    read("migrations/manifests/neon.txt"),
  ]);
  for (const value of ["mesh_business_partner_account_link", "mesh_bank_account_disclosure_inbox", "mesh_bank_account_projection"]) assert.match(control, new RegExp(value));
  assert.match(document, /business_partner_bank_verification/);
  assert.match(document, /candidate_bank_account_link_id/);
  assert.match(snapshot, /mesh_bank_account_disclosure_received/);
  assert.match(control, /mesh_bank_disclosure_inbox_safe_chk/);
  assert.match(snapshot, /mesh_bank_disclosure_received_safe_chk/);
  assert.doesNotMatch(snapshot, /account_id_value/);
  assert.match(document, /business_partner_bank_verification_sod_chk/);
  assert.match(functions, /decision evidence is immutable/);
  assert.match(migration, /current_database\(\)<>'athyper_neon'/);
  assert.match(migration, /neon\.business_partner_bank\.apply/);
  assert.match(guards, /trg_mesh_bp_account_link_guard/);
  assert.match(guards, /trg_business_partner_bank_verification_guard/);
  assert.match(manifest, /^20260828_neon_business_partner_account_bank_linkage\.sql$/m);
});
