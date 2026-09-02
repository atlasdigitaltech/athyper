import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("S4 normalizes aliases and decision scopes",()=>{
  const master=read("ddl/planes/neon/master/03_tables.sql");
  const masterConstraints=read("ddl/planes/neon/master/05_constraints.sql");
  const control=read("ddl/planes/neon/control/03_tables.sql");
  assert.match(master,/CREATE TABLE master\.business_partner_alias/);
  assert.match(master,/business_partner_aliases_cache_chk/);
  assert.match(masterConstraints,/business_partner_alias_no_overlap_excl/);
  assert.match(control,/CREATE TABLE control\.business_partner_decision_scope/);
  assert.match(control,/num_nonnulls\(qualification_id, supplier_preference_id/);
  assert.match(control,/scope_group BETWEEN 1 AND 100/);
});

test("S4 enforces catalogs, active references, ranges, cycles, and bounded JSON",()=>{
  const masterFunctions=read("ddl/planes/neon/master/07_functions.sql");
  const controlFunctions=read("ddl/planes/neon/control/07_functions.sql");
  const masterConstraints=read("ddl/planes/neon/master/05_constraints.sql");
  const tables=read("ddl/planes/neon/master/03_tables.sql")+read("ddl/planes/neon/control/03_tables.sql");
  assert.match(masterFunctions,/master\.supplier_type/);
  assert.match(masterFunctions,/master\.statement_cycle/);
  assert.match(masterFunctions,/trg_guard_partner_relationship_cycle/);
  assert.match(masterFunctions,/trg_validate_partner_profile_references/);
  assert.match(controlFunctions,/trg_validate_decision_scope/);
  assert.match(controlFunctions,/at most 100 scope rows/);
  assert.match(masterConstraints,/business_partner_operating_org_assignment_no_overlap_excl/);
  assert.match(masterConstraints,/business_partner_relationship_no_overlap_excl/);
  assert.match(tables,/octet_length\(metadata::text\) <= 16384/);
  assert.match(tables,/jsonb_array_length\(conditions\)<=50/);
});

test("S4 upgrade is manifest-owned and backfills before enforcement",()=>{
  const migration=read("migrations/20260903_neon_business_partner_integrity_hardening.sql");
  const manifest=read("migrations/manifests/neon.txt");
  assert.match(manifest,/^20260903_neon_business_partner_integrity_hardening\.sql$/m);
  assert.match(migration,/INSERT INTO master\.business_partner_alias/);
  assert.match(migration,/business_partner_aliases_cache_chk/);
  assert.match(migration,/Backfill the supported baseline's flattened scope coordinates/);
  assert.match(migration,/S4 preflight failed/);
  assert.match(migration,/CREATE TRIGGER trg_business_partner_decision_scope_validate/);
});

test("S4 polymorphic control-scope validation never dereferences absent trigger fields",()=>{
  const functions=read("ddl/planes/neon/control/07_functions.sql");
  const migration=read("migrations/20260903_neon_business_partner_control_scope_polymorphism.sql");
  const manifest=read("migrations/manifests/neon.txt");
  for(const source of [functions,migration]){
    assert.match(source,/to_jsonb\(NEW\)->>'supplier_id'/);
    assert.match(source,/to_jsonb\(NEW\)->>'commodity_capability_id'/);
    assert.match(source,/to_jsonb\(NEW\)->>'commodity_category_id'/);
    assert.match(source,/to_jsonb\(NEW\)->>'risk_assessment_id'/);
  }
  assert.match(manifest,/20260903_neon_business_partner_control_scope_polymorphism\.sql\n20260903_neon_business_partner_integrity_hardening\.sql/);
});
