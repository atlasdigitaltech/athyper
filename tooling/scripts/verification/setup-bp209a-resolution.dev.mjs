/** Local-only governed resolution prerequisites; no human grants or reference/account writes. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2]??'--dry-run';
if(process.argv.length>3||!['--dry-run','--apply'].includes(mode))throw Error('Use --dry-run or --apply');
const seed=readFileSync('server/db/ddl/common/audit/12_reference_seed.sql','utf8');
const block=seed.split('-- BEGIN protected bank audit contracts')[1]?.split('-- END protected bank audit contracts')[0];
if(!block)throw Error('Missing exact bank audit contracts');
const sql=`BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Local Neon required'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='master.bank_provisional_reference'::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'Tenant RLS required'; END IF; END $$;
${block}
GRANT UPDATE(status,resolved_institution_id,resolved_branch_id) ON master.bank_provisional_reference TO athyperapp;
SELECT code,capture_mode,status FROM master.audit_event_contract WHERE code='business_partner_bank_provisional_resolution';
SELECT has_column_privilege('athyperapp','master.bank_provisional_reference','status','UPDATE') resolution_status,
 has_column_privilege('athyperapp','master.bank_provisional_reference','submitted_name','UPDATE') submitted_name,
 has_table_privilege('athyperapp','shared.bank_institution','INSERT') global_directory_insert;
${mode==='--apply'?'COMMIT':'ROLLBACK'};`;
console.log(execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'}).trim());
