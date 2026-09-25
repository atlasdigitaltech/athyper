/** Additive, schema-before-reader DEV registration cutover. No reset or data writes. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
if(process.argv[2]!=='--apply-existing-dev')throw Error('Explicit --apply-existing-dev required');
const container='athyper-dev-db-1';
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const source=readFileSync(new URL('../../../server/db/ddl/planes/neon/master/07_functions.sql',import.meta.url),'utf8');
const start=source.indexOf('CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_registration_case(');
const end=source.indexOf('END $$;',start);
if(start<0||end<start)throw Error('Registration function missing');
const documentSource=readFileSync(new URL('../../../server/db/ddl/planes/neon/document/07_functions.sql',import.meta.url),'utf8');
const guardStart=documentSource.indexOf('CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation()');
const guardEnd=documentSource.indexOf('END $$;',guardStart);
if(guardStart<0||guardEnd<guardStart)throw Error('Case mutation guard missing');
const sql=`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Wrong target database'; END IF; END $$;
${source.slice(start,end+7)}
${documentSource.slice(guardStart,guardEnd+7)}
REVOKE ALL ON FUNCTION master.command_materialize_business_partner_registration_case(uuid,uuid,bigint,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION master.command_materialize_business_partner_registration_case(uuid,uuid,bigint,text,uuid,uuid) TO athyperapp,athyperadmin;
COMMIT;`;
execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
console.log('Applied identity-only registration function, matching case-mutation command allowlist and runtime EXECUTE grants on existing DEV. No tables, business rows, user permission grants or metadata releases changed.');
