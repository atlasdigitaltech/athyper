/** Existing-DEV, rollback-only sales identity probe. No data conversion/reset. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
if(process.argv[2]!=='--rollback-dev') throw new Error('Explicit --rollback-dev required');
const root=new URL('../../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const container='athyper-dev-db-1';
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev') throw new Error('Not DEV');
const source=read('server/db/ddl/planes/neon/document/07_functions.sql');
const fn=name=>{const start=source.indexOf(`CREATE OR REPLACE FUNCTION document.${name}(`);const end=source.indexOf('$$;',start);if(start<0||end<start)throw Error(name);return source.slice(start,end+3);};
const sql=`BEGIN;
SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
${['sales_opportunity','sales_quotation','sales_order'].map(table=>`
DO $$ BEGIN IF EXISTS(SELECT 1 FROM document.${table}) THEN
 RAISE EXCEPTION 'Probe requires empty sales tables; no implicit UUID conversion'; END IF; END $$;
ALTER TABLE document.${table} DROP CONSTRAINT ${table}_customer_fk;
ALTER TABLE document.${table} RENAME COLUMN customer_id TO business_partner_id;
ALTER TABLE document.${table} ADD CONSTRAINT ${table}_partner_fk FOREIGN KEY(tenant_id,business_partner_id)
 REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT;`).join('\n')}
${fn('trg_validate_sales_quotation')}
${fn('trg_validate_sales_order_quotation')}
${read('tooling/scripts/verification/fixtures/partner-sales-reference.sql')}
ROLLBACK;`;
execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
console.log('PASS: role-free partner sales-order reference, cross-tenant and unknown partner denial; sales-chain validators compiled. All staged schema and fixtures rolled back.');
