import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("S5 centralizes lifecycle and decision mutation authority",()=>{
  const tables=read("ddl/planes/neon/control/03_tables.sql");
  const functions=read("ddl/planes/neon/control/07_functions.sql");
  const triggers=read("ddl/planes/neon/control/08_triggers.sql")+read("ddl/planes/neon/master/08_triggers.sql");
  assert.match(tables,/CREATE TABLE control\.business_partner_mutation_evidence/);
  assert.match(functions,/control\.command_business_partner_lifecycle/);
  assert.match(functions,/control\.command_business_partner_decision/);
  assert.match(functions,/app\.current_tenant_id/);
  assert.match(functions,/Maker cannot approve or decide their own Business Partner record/);
  assert.match(triggers,/trg_business_partner_19_mutation_authority/);
  assert.match(triggers,/trg_customer_credit_review_25_mutation_authority/);
});

test("S5 evidence is immutable, bounded, forced-RLS, and outbox-backed",()=>{
  const tables=read("ddl/planes/neon/control/03_tables.sql");
  const functions=read("ddl/planes/neon/control/07_functions.sql");
  const triggers=read("ddl/planes/neon/control/08_triggers.sql");
  const rls=read("ddl/planes/neon/control/10_rls.sql");
  const grants=read("ddl/planes/neon/control/11_grants.sql");
  assert.match(tables,/resulting_version = expected_version \+ 1/);
  assert.match(tables,/octet_length\(evidence::text\)<=?\s*16384/);
  assert.match(functions,/INSERT INTO event\.outbox/);
  assert.match(functions,/Business Partner mutation evidence is append-only/);
  assert.match(functions,/Business Partner mutation evidence contains protected identity data/);
  assert.match(triggers,/trg_business_partner_mutation_evidence_payload/);
  assert.match(rls,/ALTER TABLE control\.business_partner_mutation_evidence FORCE ROW LEVEL SECURITY/);
  assert.match(grants,/REVOKE UPDATE ON control\.business_partner_qualification/);
  assert.match(grants,/control\.command_business_partner_decision/);
});

test("S5 upgrade and runtime repositories use command ownership",()=>{
  const migration=read("migrations/20260903_neon_business_partner_security_mutation_ownership.sql");
  const manifest=read("migrations/manifests/neon.txt");
  const eligibility=read("../packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts");
  const request=read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts");
  assert.match(manifest,/^20260903_neon_business_partner_security_mutation_ownership\.sql$/m);
  assert.match(manifest,/20260903_neon_business_partner_security_mutation_ownership\.sql\n20260903_neon_business_partner_security_certification_hardening\.sql/);
  assert.match(migration,/S5 preflight failed/);
  assert.match(migration,/Preserve supported-baseline Customer lifecycle evidence/);
  assert.match(eligibility,/control\.command_business_partner_decision/);
  assert.match(eligibility,/control\.command_business_partner_lifecycle/);
  assert.doesNotMatch(eligibility,/UPDATE control\.customer_credit_review SET decision/);
  assert.doesNotMatch(eligibility,/UPDATE master\.supplier SET status/);
  assert.match(request,/control\.command_business_partner_lifecycle/);
  assert.doesNotMatch(request,/UPDATE master\.business_partner SET status/);
});
