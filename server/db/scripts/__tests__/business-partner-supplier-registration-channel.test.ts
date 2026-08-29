import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("supplier registration channels are typed and invitation secrets are never persisted",async()=>{
  const[tables,constraints,functions,triggers,rls,migration,permissions,manifest,ddlManifest,service,routes,jobs]=await Promise.all([
    read("ddl/planes/neon/document/03_tables.sql"),read("ddl/planes/neon/document/05_constraints.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/10_rls.sql"),read("migrations/20260829_neon_supplier_registration_channel.sql"),
    read("migrations/20260829_neon_supplier_registration_permissions.sql"),read("migrations/manifests/neon.txt"),read("ddl/planes/neon/_manifest.txt"),
    read("../packages/services/master-data/src/supplier-registration-invitation-service.ts"),read("../packages/services/master-data/src/supplier-registration-invitation-routes.ts"),read("../packages/services/master-data/src/supplier-registration-invitation-jobs.ts")
  ]);
  for(const source of[tables,migration])for(const token of["supplier_registration_invitation","registration_mode","self_service","on_behalf","representation_evidence_id","token_hash","invitee_email_hash"])assert.match(source,new RegExp(token));
  for(const source of[constraints,migration])assert.match(source,/supplier_registration_invitation_request_fk/);
  for(const source of[functions,migration])for(const evidence of["registration channel identity is immutable","Submitted on-behalf registration requires representation evidence","accepted invitation binding"])assert.match(source,new RegExp(evidence));
  assert.match(triggers,/trg_business_partner_request_15_registration_guard/);
  assert.match(rls,/supplier_registration_invitation FORCE ROW LEVEL SECURITY/);
  assert.match(migration,/current_database\(\) <> 'athyper_neon'/);
  assert.match(manifest,/^20260829_neon_supplier_registration_channel\.sql$/m);
  assert.match(manifest,/^20260829_neon_supplier_registration_permissions\.sql$/m);
  assert.match(ddlManifest,/19_supplier_registration_permission_reference_seed\.sql/);
  for(const permission of["invitation.create","invitation.read","invitation.cancel","external.respond"])assert.match(permissions,new RegExp(`neon\\.supplier_registration\\.${permission.replace(".","\\.")}`));
  assert.match(service,/randomBytes\(32\)/);assert.match(service,/token:rawToken/);assert.match(routes,/\/api\/neon\/external\/supplier-registrations\/accept/);assert.match(jobs,/supplier-registration-invitations-expire/);
  assert.doesNotMatch(`${tables}\n${migration}`,/\b(?:raw_)?token\b\s+text/i);
  assert.doesNotMatch(`${tables}\n${migration}`,/invitee_email\s+text/i);
});
