/** Destructive, explicitly confirmed local DEV rebuild. Preserves IAM/Infisical. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { treeHash } from './model.mjs';
import { assertPartnerCutoverReady } from './partner-cutover-preflight.mjs';
if(process.argv[2]!=='--confirm-replace-dev-no-backup')throw Error('Explicit DEV replacement confirmation required');
assertPartnerCutoverReady();
const root=process.cwd(), db='athyper-dev-db-1';
const inspect=JSON.parse(execFileSync('docker',['inspect',db],{encoding:'utf8'}))[0];
if(inspect.Config.Labels['com.docker.compose.project']!=='athyper-dev' || inspect.Config.Labels['com.docker.compose.service']!=='db')throw Error('Wrong database target');
const sql=q=>execFileSync('docker',['exec',db,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',q],{stdio:'pipe'});
const output=join(homedir(),'.athyper/instances/dev/receipts',`rebuild-${Date.now()}`);
mkdirSync(output,{recursive:true,mode:0o700});
sql('ALTER SYSTEM SET max_locks_per_transaction = 512');
execFileSync('docker',['restart',db],{stdio:'pipe'});
for(let n=0;n<60;n++){try{sql('SELECT 1');break;}catch(e){if(n===59)throw e;await new Promise(r=>setTimeout(r,500));}}
for(const plane of ['studio','neon','mesh']){
 sql(`DROP DATABASE athyper_${plane} WITH (FORCE)`);
 sql(`CREATE DATABASE athyper_${plane} OWNER athyper_runtime`);
 execFileSync('docker',['exec','-i',db,'psql','-X','-U','postgres','-d',`athyper_${plane}`,'-v','ON_ERROR_STOP=1'],{
  input:readFileSync(join(root,`server/db/ddl/planes/${plane}/_database/01_database_settings.sql`),'utf8'),stdio:'pipe',
 });
 sql(`REVOKE ALL ON DATABASE athyper_${plane} FROM PUBLIC; GRANT CONNECT ON DATABASE athyper_${plane} TO athyper_worker`);
 sql(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_atlas_writer_dev') THEN GRANT CONNECT ON DATABASE athyper_${plane} TO athyper_atlas_writer_dev; END IF; END $$`);
 console.log(`Replaced athyper_${plane}; no backup created`);
}
execFileSync('docker',['exec',db,'mkdir','-p','/tmp/athyper-dev-rebuild/reconciliation']);
execFileSync('bash',['-o','pipefail','-c','tar -C "$1/server/db" -cf - ddl | docker exec -i "$2" tar -C /tmp/athyper-dev-rebuild -xf -','stage',root,db]);
execFileSync('bash',['-o','pipefail','-c','tar -C "$1/deploy/compose/instance/scripts" -cf - run-foundation.sh runtime-worker-grants-v1.sql | docker exec -i "$2" tar -C /tmp/athyper-dev-rebuild/reconciliation -xf -','stage',root,db]);
const checksum=treeHash(join(root,'server/db/ddl'));
try{
 const log=execFileSync('docker',['exec','-e','PGUSER=postgres','-e',`ATHYPER_DDL_SHA256=${checksum}`,'-e','ATHYPER_DDL_ROOT=/tmp/athyper-dev-rebuild/ddl','-e','ATHYPER_RECONCILIATION_ROOT=/tmp/athyper-dev-rebuild/reconciliation',db,'sh','/tmp/athyper-dev-rebuild/reconciliation/run-foundation.sh'],{encoding:'utf8',maxBuffer:64*1024*1024,stdio:'pipe'});
 writeFileSync(join(output,'foundation.log'),log,{mode:0o600});
 writeFileSync(join(output,'receipt.json'),JSON.stringify({instance:'dev',ddlSha256:checksum,planes:['studio','neon','mesh'],backupCreated:false,foundationPassed:true,seeded:false,published:false},null,2),{mode:0o600});
 console.log(JSON.stringify({output,foundationPassed:true,ddlSha256:checksum}));
}catch(e){writeFileSync(join(output,'foundation-failure.log'),String(e.stdout??'')+String(e.stderr??''),{mode:0o600});console.error(`Foundation failed; inspect ${output}/foundation-failure.log`);process.exitCode=1;}
