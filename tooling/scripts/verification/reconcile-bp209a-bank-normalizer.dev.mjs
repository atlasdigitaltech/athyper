/** Align the exact canonical function and repair only this run's unverified synthetic display suffix. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2]??'--dry-run';
if(process.argv.length>3||!['--dry-run','--apply'].includes(mode))throw Error('Use --dry-run or --apply');
const source=readFileSync('server/db/ddl/planes/neon/master/07_functions.sql','utf8');
const definition=source.match(/CREATE OR REPLACE FUNCTION master\.trg_normalize_bank_account\(\)[\s\S]*?\n\$\$;/)?.[0];
if(!definition?.includes('Protected bank fingerprint and four-character display suffix are required'))throw Error('Expected canonical protected normalization');
const sql=`BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Local Neon required'; END IF; END $$;
SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_actor_type','service_account',true);
SELECT set_config('app.current_principal_id',id::text,true) FROM master.principal WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND code='seed.three-plane-provisioner' AND status='active';
${definition}
DO $repair$
DECLARE account master.bank_account; n int;
BEGIN
 SELECT a.* INTO STRICT account FROM master.bank_account a JOIN master.bank_account_link l ON l.tenant_id=a.tenant_id AND l.bank_account_id=a.id
 WHERE a.tenant_id='44444444-4444-4444-8444-444444444444' AND a.id='2740c8e1-996d-4026-9b91-f3797eda10bc'
 AND l.id='bed9956c-b66e-49ad-8454-8195a9d2fc1b' AND l.owner_id='01a0cc2b-a958-7703-bade-306f61834dea'
 AND l.metadata->>'registrationIdempotencyKey'='bp209a-partner-independent-20260923' FOR UPDATE OF a;
 IF account.status<>'pending_verification' OR account.is_verified OR account.account_holder_name<>'BP2-09A synthetic acceptance - not for payment'
 OR account.created_by<>'cca94907-7519-5871-8e3c-6b11aa545c93' OR account.metadata->>'source' IS DISTINCT FROM 'protected_registration'
 OR account.metadata->>'protectedValueToken' IS NULL OR account.account_last4 NOT IN ('E6FA','3000')
 OR EXISTS(SELECT 1 FROM master.bank_account_company_usage WHERE tenant_id=account.tenant_id AND bank_account_link_id='bed9956c-b66e-49ad-8454-8195a9d2fc1b') THEN
  RAISE EXCEPTION 'Synthetic unverified fixture preconditions changed';
 END IF;
 -- 3000 is the display suffix of the public synthetic IBAN supplied to the native registration command.
 -- Never modify account_id_value, protected token, identity, verification, ownership or usage.
 UPDATE master.bank_account SET account_last4='3000',updated_at=clock_timestamp(),updated_by=current_setting('app.current_principal_id')::uuid
 WHERE tenant_id=account.tenant_id AND id=account.id AND account_last4='E6FA';
 GET DIAGNOSTICS n=ROW_COUNT; RAISE NOTICE 'Synthetic display suffix corrections: %',n;
END $repair$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT id,account_last4,status,is_verified FROM master.bank_account WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND id='2740c8e1-996d-4026-9b91-f3797eda10bc';
${mode==='--apply'?'COMMIT':'ROLLBACK'};`;
console.log(execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'}).trim());
