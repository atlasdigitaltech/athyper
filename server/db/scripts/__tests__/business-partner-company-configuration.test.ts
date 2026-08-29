import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root=new URL("../../",import.meta.url);
const read=(path:string)=>readFile(new URL(path,root),"utf8");

test("WP14 governs organization assignment and exact company finance profiles",async()=>{
  const[tables,constraints,indexes,functions,migration,manifest,repository,validator]=await Promise.all([
    read("ddl/planes/neon/document/03_tables.sql"),read("ddl/planes/neon/document/05_constraints.sql"),read("ddl/planes/neon/document/06_indexes.sql"),read("ddl/planes/neon/document/07_functions.sql"),read("migrations/20260828_neon_business_partner_company_configuration.sql"),read("migrations/manifests/neon.txt"),read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts"),read("../packages/services/master-data/src/business-partner-request-validator.ts")
  ]);
  for(const column of["materialized_supplier_company_profile_id","materialized_customer_company_profile_id"]){assert.match(tables,new RegExp(column));assert.match(migration,new RegExp(column));}
  assert.match(constraints,/business_partner_request_materialized_supplier_company_profile_fk[\s\S]*master\.company_code_supplier_profile/);
  assert.match(constraints,/business_partner_request_materialized_customer_company_profile_fk[\s\S]*master\.company_code_customer_profile/);
  assert.match(indexes,/business_partner_request_open_org_assignment_uq[\s\S]*assign_organization/);
  assert.match(indexes,/business_partner_request_open_company_configuration_uq[\s\S]*configure_company/);
  assert.match(functions,/materialized_supplier_company_profile_id/);
  assert.match(functions,/CASE WHEN NEW\.request_kind = 'configure_company' THEN 1 ELSE 0 END/);
  assert.match(migration,/current_database\(\) <> 'athyper_neon'/);
  assert.match(migration,/num_nonnulls\(NEW\.materialized_supplier_company_profile_id, NEW\.materialized_customer_company_profile_id\)/);
  assert.match(manifest,/^20260828_neon_business_partner_company_configuration\.sql$/m);
  assert.match(repository,/BUSINESS_PARTNER_QUALIFICATION_REQUIRED/);
  assert.match(repository,/BUSINESS_PARTNER_FINANCE_CONFIGURATION_INCOMPLETE/);
  assert.match(repository,/snapshot\.fn_capture_entity/);
  assert.match(validator,/company\.code\.required/);
});
