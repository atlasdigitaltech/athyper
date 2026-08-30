import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("Business Partner persistence removes legacy authorities and hardens retained evidence",async()=>{
  const[tables,constraints,functions,triggers,rls,grants,migration,manifest,repository,composition]=await Promise.all([
    read("ddl/planes/neon/document/03_tables.sql"),read("ddl/planes/neon/document/05_constraints.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/10_rls.sql"),read("ddl/planes/neon/document/11_grants.sql"),
    read("migrations/20260830_neon_business_partner_table_streamlining.sql"),read("migrations/manifests/neon.txt"),
    read("../packages/services/master-data/src/kysely-business-partner-invitation-repository.ts"),
    read("../apps/platform-host/src/composition/register-services.ts")
  ]);
  for(const legacy of["supplier_registration_invitation_legacy","supplier_registration_recovery","business_partner_invitation_applicant_policy"]){
    assert.doesNotMatch(tables,new RegExp(`CREATE TABLE document\\.${legacy}`));
    assert.doesNotMatch(`${constraints}\n${triggers}\n${rls}\n${grants}`,new RegExp(`document\\.${legacy}`));
    assert.match(migration,new RegExp(`DROP TABLE document\\.${legacy}`));
  }
  assert.match(tables,/applicant_access_revoked_at/);assert.match(repository,/applicant_access_revoked_at IS NULL/);
  assert.doesNotMatch(repository,/approved_fields|approved_actions|business_partner_invitation_applicant_policy/);
  assert.match(functions,/trg_guard_business_partner_request_evidence/);assert.match(triggers,/trg_business_partner_request_evidence_guard/);
  assert.match(functions,/fn_resolve_business_partner_duplicate[\s\S]*SECURITY DEFINER/);
  assert.doesNotMatch(grants,/GRANT SELECT,INSERT ON document\.business_partner_duplicate_resolution TO athyperapp/);
  assert.doesNotMatch(composition,/supplier_registration_recovery|business_partner_invitation_applicant_policy/);
  assert.match(manifest,/^20260830_neon_business_partner_table_streamlining\.sql$/m);
});
