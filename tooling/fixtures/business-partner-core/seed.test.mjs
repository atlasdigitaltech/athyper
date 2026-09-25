import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSql,id,rowsFor,personRowsFor,tenants,main} from './seed.mjs';
test('base fixture permits only pending decision-view examples alongside its role-free facts',()=>{
 const sql=buildSql();
 assert.ok(sql.includes("metadata->>'_seed' IS NOT DISTINCT FROM 'demo.business-partner-decision-views.v1' AND decision='pending'"));
 assert.ok(sql.includes('Fixture has acquired an out-of-scope role/assignment'));
});
test('person fixture reuses tenant-local identity and shared facts without organization subtype',()=>{
 for(const [tenant] of tenants){
  const rows=personRowsFor(tenant),person=rows.find(r=>r.table==='person'),bp=rows.find(r=>r.table==='business_partner');
  assert.equal(bp.data.person_id,person.data.id);assert.equal(bp.data.partner_category,'person');
  assert.equal(bp.data.legal_classification,'sole_proprietor');assert.equal(bp.data.code,'BP-DEMO-PERSON-001');
  assert.ok(!rows.some(r=>r.table==='business_partner_organization_identity'));
  assert.notEqual(bp.data.id,id(tenant,'partner'));
  assert.equal(rows.find(r=>r.table==='payment_instrument').data.id,rows.find(r=>r.table==='bank_account').data.id);
 }
});
test('same reusable partner template with disjoint deterministic tenant identities',()=>{
 assert.deepEqual(tenants.map(([code])=>code),['athyper','technostat','cirrusatlantic']);
 const seen=new Set();
 for(const [tenant] of tenants){
  const rows=rowsFor(tenant);assert.equal(rows.length,28);
  for(const row of rows){const key=`${row.table}:${row.data.id??row.data.contact_link_id}`;if(row.data.id){assert.ok(!seen.has(key));seen.add(key);}assert.equal(row.extras.tenant_id,'t');}
  assert.equal(rows.find(row=>row.table==='payment_instrument').data.id,rows.find(row=>row.table==='bank_account').data.id);
  assert.equal(rows[0].data.id,id(tenant,'partner'));assert.equal(rows[0].data.code,'BP-DEMO-CORE-001');
 }
});
test('covers every requested role-independent section without role or company records',()=>{
 const rows=rowsFor('athyper'),tables=new Set(rows.map(row=>row.table));
 for(const table of ['business_partner','business_partner_alias','address','address_link','contact_person','contact_link','contact_email','contact_phone','business_partner_identifier','business_partner_tax_registration','tax_jurisdiction','payment_instrument','bank_account','payment_instrument_link','bank_provisional_reference','business_partner_industry_classification','certification'])assert.ok(tables.has(table));
 for(const row of rows){assert.ok(!/^(supplier|customer|company_code|business_partner_commodity|business_partner_operating|bank_account_company|bank_account_usage)/.test(row.table));assert.equal(row.data.company_code_id??null,null);assert.equal(row.data.partner_role,undefined);assert.notEqual(row.data.is_verified,true);assert.equal(row.data.document_attachment_id??null,null);}
});
test('dry-run defaults, rollback, collision rejection and explicit apply confirmation',()=>{
 const sql=buildSql();assert.ok(sql.endsWith('ROLLBACK;'));assert.ok(sql.includes('FOR pass IN 1..2'));assert.ok(sql.includes('Fixture collision or drift'));assert.ok(!/\bDELETE\b|\bUPDATE\s+master\./i.test(sql));assert.ok(buildSql(true).endsWith('COMMIT;'));
 assert.throws(()=>main(['--apply']),/confirm/);assert.throws(()=>main(['--unknown']),/Use/);assert.throws(()=>main(['--apply','--dry-run','--confirm=LOCAL-BP-CORE-SEED']),/Use/);
});
test('classification-enabled pack adds facts without role-dependent capabilities or shared catalog writes',()=>{
 const sql=buildSql(false,{includeClassifications:true});
 assert.ok(sql.includes('INSERT INTO master.business_partner_commodity_classification'));
 assert.ok(sql.includes('INSERT INTO master.commodity_code_assignment'));
 assert.ok(!sql.includes('INSERT INTO master.business_partner_commodity_capability'));
 assert.ok(!sql.includes('INSERT INTO shared.'));assert.ok(sql.endsWith('ROLLBACK;'));
});
