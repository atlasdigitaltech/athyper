/** Explicit DEV schema preparation. No publication approval or activation. */
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join} from 'node:path';
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(a=>!['--apply','--check'].includes(a)))throw Error('Use --check or --apply');
const container=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
if(!container.State.Running||container.Config.Labels['com.docker.compose.project']!=='athyper-dev')throw Error('Running DEV required');
const name='20261001_principal_family_editing.sql';
const source=readFileSync('server/db/migrations/'+name,'utf8');
const hash=createHash('sha256').update(source).digest('hex');
const sql=(plane,statement)=>execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-U','postgres','-d','athyper_'+plane,'-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const output=join(homedir(),'.athyper/instances/dev/evidence/principal-stage2-20261001');mkdirSync(output,{recursive:true});
const checks=`
DO $$ BEGIN
 IF (SELECT atttypid FROM pg_attribute WHERE attrelid='master.principal_notification_preference'::regclass AND attname='status')<>'shared.active_inactive_d'::regtype THEN RAISE EXCEPTION 'Notification domain mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='master.principal_ui_profile'::regclass AND attname='record_version' AND attnotnull AND atttypid='bigint'::regtype) THEN RAISE EXCEPTION 'UI Profile concurrency missing'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='master' AND tablename='principal_ui_profile' AND policyname LIKE 'entity_owner_admin_%')<>3 THEN RAISE EXCEPTION 'UI Profile owner policies missing'; END IF;
END $$;`;
const report={capturedAt:new Date().toISOString(),migration:name,sha256:hash,mode:apply?'applied':'rolled_back',planes:[]};
// Rehearse every plane before the first persistent change.
for(const plane of ['studio','neon','mesh']){
 sql(plane,source.replace(/COMMIT;\s*$/,()=>checks+'\nROLLBACK;'));
 report.planes.push({plane,rehearsal:'passed'});
}
if(apply)for(const receipt of report.planes){
 const plane=receipt.plane;
 const ledger=JSON.parse(sql(plane,`SELECT coalesce((SELECT row_to_json(m) FROM public.athyper_schema_migration_v1 m WHERE migration_name='${name}'),'null'::json);`).trim());
 if(ledger&&(ledger.status!=='applied'||ledger.sha256!==hash))throw Error('Migration ledger conflict: '+plane);
 if(!ledger)sql(plane,source.replace(/COMMIT;\s*$/,()=>checks+`\nINSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES('${name}','${hash}','applied','principal-family-dev',clock_timestamp(),clock_timestamp());\nCOMMIT;`));
 receipt.applied=true;
}
writeFileSync(join(output,apply?'schema-applied.json':'schema-rehearsal.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
