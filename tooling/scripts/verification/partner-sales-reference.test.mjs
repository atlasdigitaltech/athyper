import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=new URL('../../../server/db/ddl/planes/neon/document/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
for(const table of ['sales_opportunity','sales_quotation','sales_order'])test(`${table} stores partner identity`,()=>{
 const body=read('03_tables.sql').split(`CREATE TABLE document.${table} (`)[1].split('\n);')[0];
 assert.match(body,/business_partner_id\s+uuid\s+NOT NULL/);
 assert.doesNotMatch(body,/\bcustomer_id\b/);
 assert.match(read('05_constraints.sql'),new RegExp(`${table}_partner_fk[\\s\\S]*?FOREIGN KEY \\(tenant_id, business_partner_id\\)\\s+REFERENCES master.business_partner \\(tenant_id, id\\)`));
});
test('sales-chain equality checks use partner identity',()=>{
 const functions=read('07_functions.sql');
 assert.match(functions,/v_opp.business_partner_id <> NEW.business_partner_id/);
 assert.match(functions,/v_quote.business_partner_id <> NEW.business_partner_id/);
 for(const file of ['03_tables.sql','05_constraints.sql','06_indexes.sql','07_functions.sql','08_triggers.sql']) assert.doesNotMatch(read(file),/\bcustomer_id\b|master\.customer\b/);
});
