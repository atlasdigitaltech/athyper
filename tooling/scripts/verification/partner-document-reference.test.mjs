import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=new URL('../../../server/db/ddl/planes/neon/document/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
export const tables=['commitment','purchase_invoice','payment_entry','purchase_requisition_line','purchase_order_confirmation','delivery_note','receipt','receipt_line','service_sheet','service_sheet_line','sourcing_event_award','payment_remittance_output','workforce_requisition_supplier','external_candidate_submission','contingent_work_order','statement_of_work','worker_engagement','external_service_entry'];
for(const table of tables)test(`${table} references tenant-scoped Business Partner identity`,()=>{
 const body=read('03_tables.sql').split(`CREATE TABLE document.${table} (`)[1]?.split('\n);')[0];
 assert.ok(body,table);
 assert.match(body,table==='purchase_requisition_line'?/suggested_business_partner_id\s+uuid/:/\bbusiness_partner_id\s+uuid/);
 assert.doesNotMatch(body,/\b(supplier_id|suggested_supplier_id)\b/);
 const constraints=read('05_constraints.sql').split(`ALTER TABLE document.${table}\n`)[1]?.split(';')[0];
 assert.ok(constraints,table);
 assert.match(constraints,/FOREIGN KEY\s*\(tenant_id,\s*(suggested_)?business_partner_id\)\s+REFERENCES master.business_partner\s*\(tenant_id,\s*id\)/);
});
test('document-chain checks and views no longer compare Supplier identities',()=>{
 const functions=read('07_functions.sql');
 for(const value of ['v_service_sheet.business_partner_id <> v_parent.business_partner_id','i.business_partner_id = v_payment.business_partner_id','distribution.business_partner_id = NEW.business_partner_id','submission.business_partner_id = NEW.business_partner_id','work_order.business_partner_id = NEW.business_partner_id','sow.business_partner_id = NEW.business_partner_id'])assert.ok(functions.includes(value),value);
 assert.match(functions,/s\.status='active' AND s\.supplier_enabled/);
 for(const file of ['06_indexes.sql','08_triggers.sql','09_views.sql'])assert.doesNotMatch(read(file),/\bsupplier_id\b|\bsuggested_supplier_id\b/);
});
test('new workforce publication payload never reinterprets supplierId as a BP UUID',()=>{
 const body=read('07_functions.sql').split('CREATE OR REPLACE FUNCTION document.command_publish_workforce_requisition(')[1].split('END $$;')[0];
 assert.match(body,/item\?'businessPartnerId'/);
 assert.match(body,/v_distribution->>'businessPartnerId'/);
 assert.match(body,/'partnerTargets'/);
 assert.match(body,/'counterpartyContract','business_partner.v1'/);
 assert.match(body,/p_expected_version IS NULL OR p_distributions IS NULL OR p_idempotency_key IS NULL/);
 assert.doesNotMatch(body,/supplierId|supplierTargets/);
});
test('posted-payment guard references only real payment fields',()=>{
 const table=read('03_tables.sql').split('CREATE TABLE document.payment_entry (')[1].split('\n);')[0];
 const guard=read('07_functions.sql').split('CREATE OR REPLACE FUNCTION document.trg_guard_payment_posted()')[1].split('$$;')[0];
 for(const [,field] of guard.matchAll(/NEW\.(\w+)/g))assert.match(table,new RegExp(`\\b${field}\\s+`),field);
 assert.match(guard,/OLD.status IN \('posted','transmitted','cleared'\)/);
 assert.match(guard,/NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id/);
});
test('workforce rates keep tenant ownership and overlap enforcement on BP coordinates',()=>{
 const control=name=>readFileSync(new URL('../control/'+name,root),'utf8');
 const table=control('03_tables.sql').split('CREATE TABLE control.external_workforce_rate (')[1].split('\n);')[0];
 assert.match(table,/business_partner_id\s+uuid/);assert.doesNotMatch(table,/\bsupplier_id\b/);
 assert.match(control('05_constraints.sql'),/external_workforce_rate_partner_fk FOREIGN KEY \(tenant_id, business_partner_id\) REFERENCES master.business_partner/);
 const overlap=control('05_constraints.sql').split('ADD CONSTRAINT external_workforce_rate_no_overlap')[1].split(';')[0];
 assert.match(overlap,/COALESCE\(business_partner_id/);assert.match(overlap,/daterange/);
});
