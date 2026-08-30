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
    read("../packages/services/master-data/src/business-partner-invitation-service.ts"),read("../packages/services/master-data/src/business-partner-invitation-routes.ts"),read("../packages/services/master-data/src/business-partner-invitation-jobs.ts")
  ]);
  for(const token of["business_partner_invitation","registration_mode","self_service","on_behalf","representation_evidence_id","token_hash","invitee_email_hash"])assert.match(tables,new RegExp(token));
  for(const token of["supplier_registration_invitation","registration_mode","self_service","on_behalf","representation_evidence_id","token_hash","invitee_email_hash"])assert.match(migration,new RegExp(token));
  assert.match(constraints,/business_partner_invitation_request_fk/);assert.match(migration,/supplier_registration_invitation_request_fk/);
  for(const source of[functions,migration])for(const evidence of["registration channel identity is immutable","Submitted on-behalf registration requires representation evidence","accepted invitation binding"])assert.match(source,new RegExp(evidence));
  assert.match(triggers,/trg_business_partner_request_15_registration_guard/);
  assert.match(rls,/business_partner_invitation FORCE ROW LEVEL SECURITY/);
  assert.match(migration,/current_database\(\) <> 'athyper_neon'/);
  assert.match(manifest,/^20260829_neon_supplier_registration_channel\.sql$/m);
  assert.match(manifest,/^20260829_neon_supplier_registration_permissions\.sql$/m);
  assert.match(ddlManifest,/19_supplier_registration_permission_reference_seed\.sql/);
  for(const permission of["invitation.create","invitation.read","invitation.cancel","external.respond"])assert.match(permissions,new RegExp(`neon\\.supplier_registration\\.${permission.replace(".","\\.")}`));
  assert.match(service,/randomBytes\(32\)/);assert.match(service,/token: rawToken/);assert.match(routes,/path: "supplier"/);assert.match(routes,/\$\{config\.path\}-registrations\/accept/);assert.match(jobs,/business-partner-invitations-expire/);
  assert.doesNotMatch(`${tables}\n${migration}`,/\b(?:raw_)?token\b\s+text/i);
  assert.doesNotMatch(`${tables}\n${migration}`,/invitee_email\s+text/i);
});
