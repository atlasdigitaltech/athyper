import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("supplier preference is effective-dated, scoped, governed, and tenant-isolated",async()=>{
  const[tables,indexes,functions,triggers,rls,grants,migration,manifest]=await Promise.all([
    read("ddl/planes/neon/control/03_tables.sql"),read("ddl/planes/neon/control/06_indexes.sql"),
    read("ddl/planes/neon/control/07_functions.sql"),read("ddl/planes/neon/control/08_triggers.sql"),
    read("ddl/planes/neon/control/10_rls.sql"),read("ddl/planes/neon/control/11_grants.sql"),
    read("migrations/20260828_neon_supplier_preference.sql"),read("migrations/manifests/neon.txt")]);
  for(const source of[tables,migration])for(const token of["supplier_preference_designation","operating_organization_id","company_code_id","commodity_category_id","effective_from","effective_until","decision_fingerprint","revocation_fingerprint","row_version","no_self_approval"])assert.match(source,new RegExp(token));
  assert.match(indexes,/supplier_preference_designation_resolution_idx/);
  for(const source of[functions,migration]){assert.match(source,/Overlapping approved supplier preference scope exists/);assert.match(source,/daterange/);assert.match(source,/Supplier preference row version must advance exactly once/);}
  assert.match(triggers,/trg_supplier_preference_designation_20_guard/);
  assert.match(rls,/ALTER TABLE control\.supplier_preference_designation FORCE ROW LEVEL SECURITY/);
  assert.match(grants,/GRANT SELECT, INSERT, UPDATE ON[\s\S]*control\.supplier_preference_designation/);
  assert.match(manifest,/^20260828_neon_supplier_preference\.sql$/m);
});

test("preference authorization and audit contracts are production reference seeds",async()=>{
  const[permission,audit,auditMigration,neonManifest,meshManifest,studioManifest]=await Promise.all([
    read("ddl/planes/neon/authz/16_supplier_preference_permission_reference_seed.sql"),read("ddl/common/audit/12_reference_seed.sql"),
    read("migrations/20260828_business_partner_preference_audit_contract.sql"),read("migrations/manifests/neon.txt"),read("migrations/manifests/mesh.txt"),read("migrations/manifests/studio.txt")]);
  assert.match(permission,/seed-expected-row-count: exact:1/);assert.match(permission,/neon\.supplier\.preference\.admin/);assert.match(permission,/'high',true,true/);assert.match(permission,/'operating_organization','subtree'/);
  for(const source of[audit,auditMigration]){assert.match(source,/preference\\\.\(created\|approved\|rejected\|revoked\)/);assert.match(source,/'revoke'/);}
  assert.match(audit,/65536, 5/);assert.match(auditMigration,/schema_version=3/);
  for(const manifest of[neonManifest,meshManifest,studioManifest])assert.match(manifest,/^20260828_business_partner_preference_audit_contract\.sql$/m);
});
