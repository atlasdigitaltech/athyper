/** Dedicated PostgreSQL/Redis/MinIO for release-19 qualification. No shared runtime writers. */
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync,openSync,closeSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
const root=join(homedir(),'.athyper/instances/dev/deployments/bp-release-19-isolated-20260910');
mkdirSync(root,{recursive:true,mode:0o700});
const run=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const inspect=name=>JSON.parse(run(['inspect',name]))[0];
const source=inspect('athyper-dev-db-1');
const manifestPath=join(root,'infrastructure.json');
if(existsSync(manifestPath))throw Error('Preserve existing isolated instance; inspect its manifest before resuming');
const network='athyper-bp-r19-isolated',database='athyper-bp-r19-db',redis='athyper-bp-r19-redis',objectstore='athyper-bp-r19-objectstore';
const password=randomBytes(32).toString('hex');
writeFileSync(join(root,'database.env'),'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
writeFileSync(join(root,'objectstore.env'),'MINIO_ROOT_USER=bpqualification\nMINIO_ROOT_PASSWORD='+randomBytes(32).toString('hex')+'\n',{mode:0o600});
const manifest={schemaVersion:1,kind:'bp_release_19_isolated_infrastructure',createdAt:new Date().toISOString(),network,database,redis,objectstore,root,sourceDatabaseContainer:source.Id,sourceApiImage:inspect('athyper-dev-api-1').Image,sourceWorkerImage:inspect('athyper-dev-worker-1').Image,databases:[],ready:false,apiStarted:false,workerStarted:false,activeDevChanged:false};
const save=()=>writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});save();
run(['network','create','--internal',network]);
run(['run','-d','--name',database,'--network',network,'--env-file',join(root,'database.env'),'--mount','type=volume,src=athyper-bp-r19-postgres,dst=/var/lib/postgresql/data','postgres:16.13-bookworm']);
for(let n=0;n<40;n++){try{run(['exec',database,'pg_isready','-U','postgres']);break;}catch{if(n===39)throw Error('Isolated database startup failed');await new Promise(r=>setTimeout(r,250));}}
run(['run','-d','--name',redis,'--network',network,'redis:7.4.8-alpine','redis-server','--appendonly','yes']);
run(['run','-d','--name',objectstore,'--network',network,'--env-file',join(root,'objectstore.env'),'--mount','type=volume,src=athyper-bp-r19-objects,dst=/data','minio/minio:RELEASE.2025-09-07T16-13-09Z','server','/data']);
// Roles are copied without password hashes. All login credentials are isolated below.
const globals=run(['exec','athyper-dev-db-1','pg_dumpall','-U','postgres','--roles-only','--no-role-passwords']);
const sanitized=globals.split('\n').filter(l=>!/^CREATE ROLE postgres;/.test(l)&&!/^ALTER ROLE postgres /.test(l)).join('\n');
run(['exec','-i',database,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sanitized});
run(['exec','-i',database,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:"ALTER ROLE athyper_runtime PASSWORD '"+password+"'; ALTER ROLE athyper_worker PASSWORD '"+password+"';"});
for(const name of ['athyper_studio','athyper_neon','athyper_mesh']){
 const file=join(root,name+'.dump'),fd=openSync(file,'wx',0o600);
 try{execFileSync('docker',['exec','athyper-dev-db-1','pg_dump','-U','postgres','-Fc',name],{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}
 run(['exec',database,'createdb','-U','postgres',name]);
 const input=openSync(file,'r');try{execFileSync('docker',['exec','-i',database,'pg_restore','-U','postgres','--exit-on-error','-d',name],{stdio:[input,'pipe','pipe'],maxBuffer:2000000});}finally{closeSync(input);}
 manifest.databases.push({name,snapshotSha256:createHash('sha256').update(readFileSync(file)).digest('hex')});save();console.log({cloned:name});
}
manifest.ready=true;save();
console.log({root,network,databases:manifest.databases.length,ready:true,apiStarted:false,workerStarted:false});
