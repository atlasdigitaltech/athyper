import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const sourceRoot=resolve(root,"../packages/services/master-data/src");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("BS360-01 stages each identity extension in a typed tenant-bound relation",async()=>{
  const migration=await read("migrations/20260830_neon_business_partner_typed_request_extensions.sql");
  for(const table of["address","contact_person","contact_channel","identifier","tax_registration","classification","certification"]){
    assert.match(migration,new RegExp(`CREATE TABLE document\\.business_partner_request_${table}\\(`));
  }
  assert.match(migration,/extension_mode text NOT NULL DEFAULT 'legacy_untyped'/);
  assert.match(migration,/extension_mode='typed_v1' AND extension_fingerprint ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(migration,/FOREIGN KEY\(tenant_id,request_id\)/);
  assert.match(migration,/Typed request extensions are editable only before submission/);
  assert.match(migration,/FORCE ROW LEVEL SECURITY/g);
});

test("BS360-01 closes restricted JSON and records immutable application coordinates",async()=>{
  const [migration,repository,service,manifest]=await Promise.all([
    read("migrations/20260830_neon_business_partner_typed_request_extensions.sql"),
    readFile(resolve(sourceRoot,"kysely-business-partner-request-repository.ts"),"utf8"),
    readFile(resolve(sourceRoot,"business-partner-request-service.ts"),"utf8"),
    read("migrations/manifests/neon.txt"),
  ]);
  assert.match(migration,/fn_business_partner_payload_has_restricted_key/);
  assert.match(migration,/nationalidentifier/);
  assert.match(migration,/materialization evidence is immutable/);
  assert.match(repository,/materializeIdentityExtensions\(input,request,text\(partner,"id"\),transaction\)/);
  assert.match(repository,/INSERT INTO document\.business_partner_request_materialization_item/);
  assert.match(repository,/BUSINESS_PARTNER_REQUEST_EXTENSION_DRIFT/);
  assert.match(repository,/extensionSummary:request\.extensionSummary/);
  assert.match(repository,/protected_value_token/);
  assert.match(service,/extensionSummary:request\.extensionSummary/);
  assert.match(service,/BUSINESS_PARTNER_REQUEST_VOLATILE_VALIDATION_FAILED/);
  assert.doesNotMatch(service,/payload: \{[^}]*proposedPayload/);
  assert.match(manifest,/^20260830_neon_business_partner_typed_request_extensions\.sql$/m);
});
