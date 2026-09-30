/** Private registration-authority compilation and context denial; rollback only. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
if(process.argv[2]!=='--rollback-dev')throw Error('Explicit --rollback-dev required');
const container='athyper-dev-db-1';
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const source=readFileSync(new URL('../../../server/db/ddl/planes/neon/master/07_functions.sql',import.meta.url),'utf8');
const start=source.indexOf('CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_registration_case(');
const end=source.indexOf('END $$;',start);
if(start<0||end<start)throw Error('Registration function missing');
const sql=`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
${source.slice(start,end+7)}
DO $test$ DECLARE tenant uuid;actor uuid; BEGIN
 SELECT tenant_id,created_by INTO STRICT tenant,actor FROM master.business_partner ORDER BY id LIMIT 1;
 PERFORM set_config('app.database_plane','neon',true);
 PERFORM set_config('app.current_tenant_id',tenant::text,true);
 PERFORM set_config('app.current_principal_id',actor::text,true);
 BEGIN
  PERFORM master.command_materialize_business_partner_registration_case(shared.uuidv7(),shared.uuidv7(),1,'registration-probe',actor);
  RAISE EXCEPTION 'TEST: wrong tenant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM master.command_materialize_business_partner_registration_case(tenant,shared.uuidv7(),1,'registration-probe',shared.uuidv7());
  RAISE EXCEPTION 'TEST: wrong actor accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM master.command_materialize_business_partner_registration_case(tenant,shared.uuidv7(),NULL,'registration-probe',actor);
  RAISE EXCEPTION 'TEST: null version accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM master.command_materialize_business_partner_registration_case(tenant,shared.uuidv7(),1,'registration-probe',actor);
  RAISE EXCEPTION 'TEST: missing approved case accepted';
 EXCEPTION WHEN no_data_found THEN NULL; END;
END $test$; ROLLBACK;`;
execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
console.log('PASS: registration authority compiles; tenant/actor/null-version/missing-case denied. Positive approved-case workflow NOT tested. All changes rolled back.');
