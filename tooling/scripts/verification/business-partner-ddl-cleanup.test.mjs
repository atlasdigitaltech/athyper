import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root='server/db/ddl/';
const read=p=>fs.readFileSync(root+p,'utf8');
const manifest=read('planes/neon/_manifest.txt').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
const ddl=manifest.map(read).join('\n');
const table=(schema,name)=>{
 const m=ddl.match(new RegExp('CREATE TABLE '+schema+'\\.'+name+' \\([\\s\\S]*?\\n\\);'));
 assert.ok(m,`${schema}.${name} missing`);return m[0];
};
test('retired authorities and request scaffolding are absent from clean-install DDL',()=>{
 for(const name of ['master.bank_account_usage','master.bank_account_company_usage','document.business_partner_bank_verification',
  'master.bank_account_link','control.business_partner_qualification_classification',
  'master.business_partner_commodity_capability','master.business_partner_commodity_classification_origin']){
  assert.doesNotMatch(ddl,new RegExp('(?:CREATE TABLE|REFERENCES|DROP TABLE(?: IF EXISTS)?) '+name.replaceAll('.','\\.')+'\\b'));
 }
 assert.doesNotMatch(ddl,/(?:CREATE TABLE|DROP TABLE(?: IF EXISTS)?) document\.business_partner_request(?:\s|_)/);
 for(const f of manifest)assert.ok(fs.existsSync(root+f),f);
});
test('generic instrument owner and treasury linkage are retained; verification removed',()=>{
 const instrument=table('master','payment_instrument');
 assert.match(instrument,/instrument_type_code = 'bank_account'/);
 const bank=table('master','bank_account');
 assert.match(bank,/FOREIGN KEY \(tenant_id,id\)\s+REFERENCES master.payment_instrument/);
 assert.doesNotMatch(bank,/\b(?:is_verified|verified_at|verified_by|verification_method|pending_verification|bank_name_override|bank_country_override|status)\b/);
 const link=table('master','payment_instrument_link');
 for(const f of ['owner_type_id','owner_id','company_code_id','payment_instrument_id','relationship_role'])assert.match(link,new RegExp('\\b'+f+'\\b'));
 assert.match(table('master','bank_account_house_config'),/payment_instrument_link_id/);
});
test('qualification and restriction no longer duplicate scope coordinates',()=>{
 const q=table('control','business_partner_qualification');
 const b=table('control','business_partner_block');
 for(const value of [q,b])assert.doesNotMatch(value,/\b(?:partner_role|role_id|partner_role_scope|operating_organization_id|company_code_id)\b/);
 assert.match(q,/approved_snapshot_id uuid/);
 assert.match(b,/operation_codes text\[\] NOT NULL/);
 assert.match(b,/scope_sealed boolean NOT NULL DEFAULT false/);
 assert.match(ddl,/USING gin\(operation_codes\)/);
});
test('scope has explicit owners, modes, classification and geographic purpose',()=>{
 const scope=table('control','business_partner_decision_scope');
 for(const value of ['block_id','commodity_classification_id','commercial_capacity_code','country_purpose','selection_mode'])assert.match(scope,new RegExp('\\b'+value+'\\b'));
 assert.match(scope,/THEN effective_from IS NULL AND effective_until IS NULL/);
 assert.match(ddl,/scope_sealed=true/);
 assert.match(ddl,/DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION control.require_partner_decision_coverage/);
});
test('partner aliases and parent relationship have only one writable authority',()=>{
 assert.doesNotMatch(table('master','business_partner'),/\b(?:aliases|parent_business_partner_id)\b/);
 assert.match(ddl,/business_partner_parent_single_period EXCLUDE USING gist/);
 assert.match(ddl,/AS parent_business_partner_id/);
 assert.match(ddl,/AS aliases/);
});
test('contact responsibility reuses common table and validates address ownership',()=>{
 assert.match(read('common/master/03_tables.sql'),/address_link_id\s+uuid/);
 assert.match(read('common/master/07_functions.sql'),/a\.owner_type_id=c\.owner_type_id AND a\.owner_id=c\.owner_id/);
 assert.match(read('common/master/08_triggers.sql'),/trg_address_link_contact_owner_guard/);
 assert.match(read('common/master/06_indexes.sql'),/contact_person_role_period_excl/);
});
