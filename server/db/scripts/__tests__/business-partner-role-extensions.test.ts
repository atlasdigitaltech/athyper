import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("WP13 persists exactly one independently approved supplier or customer role",async()=>{const[tables,constraints,indexes,migration,manifest]=await Promise.all([read("ddl/planes/neon/document/03_tables.sql"),read("ddl/planes/neon/document/05_constraints.sql"),read("ddl/planes/neon/document/06_indexes.sql"),read("migrations/20260828_neon_business_partner_role_extensions.sql"),read("migrations/manifests/neon.txt")]);for(const source of[tables,migration])assert.match(source,/materialized_customer_id/);assert.match(tables,/WHEN 'add_supplier'[\s\S]*requested_role='supplier'[\s\S]*materialized_supplier_id IS NOT NULL/);assert.match(tables,/WHEN 'add_customer'[\s\S]*requested_role='customer'[\s\S]*materialized_customer_id IS NOT NULL/);assert.match(constraints,/business_partner_request_materialized_customer_fk[\s\S]*REFERENCES master\.customer/);assert.match(indexes,/business_partner_request_open_role_extension_uq[\s\S]*add_supplier[\s\S]*add_customer/);assert.match(migration,/current_database\(\) <> 'athyper_neon'/);assert.match(manifest,/^20260828_neon_business_partner_role_extensions\.sql$/m);});

test("WP13 repository reuses one identity and selects role-compatible organizations",async()=>{const source=await read("../packages/services/master-data/src/kysely-business-partner-request-repository.ts");assert.match(source,/BUSINESS_PARTNER_ROLE_EXTENSION_ALREADY_OPEN/);assert.match(source,/request\.targetBusinessPartnerId[\s\S]*FROM master\.business_partner/);assert.match(source,/organization\.domain IN \(\$\{role==="supplier"\?"procurement":"sales"\},'both'\)/);assert.match(source,/INSERT INTO master\.supplier/);assert.match(source,/INSERT INTO master\.customer/);assert.match(source,/materialized_customer_id=/);assert.doesNotMatch(source,/request\.kind!=="new_partner"\|\|request\.requestedRole!=="supplier"/);});
