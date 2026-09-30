/** Same-DEV document cutover. Only empty source tables may be retargeted; test rows always roll back. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const mode=process.argv[2];
if(!['--rollback-dev','--apply-existing-dev','--verify-applied-dev','--align-applied-fks-dev'].includes(mode))throw Error('Explicit DEV mode required');
const commit=mode==='--apply-existing-dev'||mode==='--align-applied-fks-dev';
const container='athyper-dev-db-1';
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const read=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
const source=read('server/db/ddl/planes/neon/document/07_functions.sql');
const tables=['commitment','purchase_invoice','payment_entry','purchase_requisition_line','purchase_order_confirmation','delivery_note','receipt','receipt_line','service_sheet','service_sheet_line','sourcing_event_award','payment_remittance_output','workforce_requisition_supplier','external_candidate_submission','contingent_work_order','statement_of_work','worker_engagement','external_service_entry'];
const constraintSource=read('server/db/ddl/planes/neon/document/05_constraints.sql');
const partnerFk=table=>{
 const line=constraintSource.split('\n').find(line=>line.includes(`ADD CONSTRAINT ${table}_business_partner_fk `));
 if(!line||!line.includes('REFERENCES master.business_partner'))throw Error(`Missing source FK: ${table}`);
 return line.trim().replace(/[,;]$/,'');
};
const names=['trg_guard_payment_posted','trg_validate_purchase_invoice_line','trg_validate_payment_allocation','trg_guard_p2p_header','trg_manage_sourcing_award','trg_validate_sourcing_award_allocation','trg_guard_service_sheet_source_allocation','trg_guard_external_candidate_submission','trg_guard_contingent_work_order','trg_guard_worker_engagement','command_publish_workforce_requisition'];
const fn=name=>{const start=source.indexOf(`CREATE OR REPLACE FUNCTION document.${name}(`);const end=source.indexOf('$$;',start);if(start<0||end<start)throw Error(name);return source.slice(start,end+3);};
const views=read('server/db/ddl/planes/neon/document/09_views.sql');
const viewNames=['purchase_order','v_ap_invoice_summary','v_purchase_order_header','v_purchase_invoice_header','v_party_advance_balance'];
const view=name=>{const start=views.search(new RegExp(`CREATE OR REPLACE VIEW "?document"?\\."?${name}"?\\s`));const end=views.indexOf(';',start);if(start<0||end<start)throw Error(name);return views.slice(start,end+1);};
const cutover=`
${tables.map(table=>{const column=table==='purchase_requisition_line'?'suggested_supplier_id':'supplier_id';const target=table==='purchase_requisition_line'?'suggested_business_partner_id':'business_partner_id';return `
DO $$ DECLARE fk record; BEGIN
 IF EXISTS(SELECT 1 FROM document.${table}) THEN RAISE EXCEPTION 'Nonempty ${table}; explicit data conversion required'; END IF;
 FOR fk IN SELECT conname FROM pg_constraint WHERE conrelid='document.${table}'::regclass AND confrelid='master.supplier'::regclass LOOP
  EXECUTE format('ALTER TABLE document.${table} DROP CONSTRAINT %I',fk.conname);
 END LOOP;
END $$;
ALTER TABLE document.${table} RENAME COLUMN ${column} TO ${target};
ALTER TABLE document.${table} ${partnerFk(table)};`;}).join('\n')}
${names.map(fn).join('\n')}
${viewNames.filter(name=>name!=='purchase_order').map(name=>`ALTER VIEW document.${name} RENAME COLUMN supplier_id TO business_partner_id;`).join('\n')}
${viewNames.map(view).join('\n')}`;
const sql=`BEGIN;
SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
LOCK TABLE ${tables.map(t=>'document.'+t).join(',')} IN ACCESS EXCLUSIVE MODE;
${mode==='--verify-applied-dev'?'':`DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('document','control','master') AND p.prosrc ~ 'supplier_id'
    AND p.prosrc ~ '${tables.join('|')}'
    AND NOT(n.nspname='document' AND p.proname=ANY(ARRAY[${names.map(n=>`'${n}'`).join(',')}])))
 THEN RAISE EXCEPTION 'Unreviewed legacy document function dependency; cutover refused'; END IF;
END $$;`}
ALTER TABLE master.business_partner ADD COLUMN IF NOT EXISTS supplier_enabled boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS customer_enabled boolean NOT NULL DEFAULT false;
${mode==='--verify-applied-dev'?'':mode==='--align-applied-fks-dev'?tables.map(table=>`ALTER TABLE document.${table} DROP CONSTRAINT ${table}_business_partner_fk, ${partnerFk(table)};`).join('\n'):cutover}
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='document' AND p.proname='command_publish_workforce_requisition' AND position('business_partner.v1' in p.prosrc)>0) THEN RAISE EXCEPTION 'Workforce command contract missing'; END IF;
 ${tables.map(table=>`IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='document.${table}'::regclass AND conname='${table}_business_partner_fk' AND confrelid='master.business_partner'::regclass AND contype='f' AND convalidated AND confdeltype='${partnerFk(table).includes('ON DELETE RESTRICT')?'r':'a'}') THEN RAISE EXCEPTION 'Applied FK differs from clean-install source: ${table}'; END IF;`).join('\n')}
END $$;
SAVEPOINT reference_fixtures;
${read('tooling/scripts/verification/fixtures/partner-document-reference.sql')}
ROLLBACK TO SAVEPOINT reference_fixtures;
${commit?'COMMIT':'ROLLBACK'};`;
try{execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});}
catch(error){process.stderr.write(String(error.stderr??error.message));process.exitCode=1;}
if(!process.exitCode)console.log(`PASS: 18 document references, 11 validators/commands and 5 views; purchasing/payment/workforce integrity fixtures passed and rolled back. ${commit?'Scoped schema changes committed on existing DEV; no business rows converted or deleted.':'Outer transaction rolled back.'} No business authorization or payment release claimed.`);
