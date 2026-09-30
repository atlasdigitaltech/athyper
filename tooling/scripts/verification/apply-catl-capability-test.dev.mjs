import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2],container='athyper-dev-db-1';
if(!['--rollback-dev','--apply-existing-dev'].includes(mode))throw Error('Explicit DEV mode required');
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const sql=readFileSync(new URL('./grant-catl-capability-test.dev.sql',import.meta.url),'utf8');
try{execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';\n${sql}\n${mode==='--apply-existing-dev'?'COMMIT':'ROLLBACK'};`,stdio:['pipe','pipe','pipe']});console.log(`${mode}: two CATL-admin tenant-exact capability grants, seven-day expiry; no qualification/restriction/approval/payment grants.`);}
catch(error){process.stderr.write(String(error.stderr??error.message));process.exitCode=1;}
