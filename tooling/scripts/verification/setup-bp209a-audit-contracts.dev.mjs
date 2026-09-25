/** Install only the missing protected-bank audit contracts; no grants or account writes. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2]??'--dry-run';
if(process.argv.length>3||!['--dry-run','--apply'].includes(mode))throw Error('Use --dry-run or --apply');
const seed=readFileSync('server/db/ddl/common/audit/12_reference_seed.sql','utf8');
const block=seed.split('-- BEGIN protected bank audit contracts')[1]?.split('-- END protected bank audit contracts')[0];
if(!block)throw Error('Missing exact bank audit contracts');
const sql=`BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Local Neon required'; END IF; END $$;
${block}
SELECT code,capture_mode,status FROM master.audit_event_contract WHERE code IN ('business_partner_bank_registration','business_partner_bank_reveal');
${mode==='--apply'?'COMMIT':'ROLLBACK'};`;
console.log(execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'}).trim());
