/** Prepare only allowlisted isolated configuration; never copy source credentials. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';
const root=homedir()+'/.athyper/instances/dev/deployments/bp-release-19-isolated-20260910';
const run=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:2000000});
const source=JSON.parse(run(['exec','athyper-dev-api-1','node','--input-type=module','-e',`import{readFileSync,readdirSync}from'node:fs';const pid=readdirSync('/proc').find(p=>/^\\d+$/.test(p)&&readFileSync('/proc/'+p+'/cmdline','utf8').startsWith('node\\0dist/main.js'));const e=Object.fromEntries(readFileSync('/proc/'+pid+'/environ','utf8').split('\\0').filter(v=>v.includes('=')).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));const keys=['KEYCLOAK_ISSUER_URL','IAM_ISSUER_URL','KEYCLOAK_BASE_URL','KEYCLOAK_REALM','KEYCLOAK_CLIENT_ID','IAM_CLIENT_ID','KEYCLOAK_JWKS_URL','IAM_DEFAULT_REALM_KEY','IAM_CLAIM_CONTEXT_MODE','IAM_REQUIRE_AUTHORIZED_ROLE','IAM_ENFORCE_REQUIRED_ACTIONS','PUBLICATION_RUNTIME_VERSION'];console.log(JSON.stringify(Object.fromEntries(keys.filter(k=>e[k]).map(k=>[k,e[k]]))));`]));
const parse=file=>Object.fromEntries(readFileSync(root+'/'+file,'utf8').trim().split('\n').map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));
const password=parse('database.env').POSTGRES_PASSWORD,objects=parse('objectstore.env');
const env={...source,NODE_ENV:'development',ATHYPER_ENV:'local',PORT:'4000',BP_ISOLATED_EXECUTION:'release19',BP_AUTHORIZATION_MODE:'off',REDIS_URL:'redis://athyper-bp-r19-redis:6379/0',REDIS_BULLMQ_URL:'redis://athyper-bp-r19-redis:6379/1',REDIS_KEY_PREFIX:'bp-r19:',S3_ENDPOINT:'http://athyper-bp-r19-objectstore:9000',S3_BUCKET:'bp-release19-qualification',APP_S3_ACCESS_KEY:objects.MINIO_ROOT_USER,APP_S3_SECRET_KEY:objects.MINIO_ROOT_PASSWORD,PUBLICATION_TARGET_PLANES:'neon',PUBLICATION_API_ENABLED:'true',EMAIL_PROVIDER:'disabled',NOTIFICATION_CAPTURE:'false',ISOLATED_OPERATOR_TOKEN:randomBytes(32).toString('hex')};
for(const p of ['studio','neon','mesh']){env[p==='neon'?'DATABASE_URL':p.toUpperCase()+'_DATABASE_URL']=`postgresql://athyper_runtime:${password}@athyper-bp-r19-db:5432/athyper_${p}`;env[p.toUpperCase()+'_WORKER_DATABASE_URL']=`postgresql://athyper_worker:${password}@athyper-bp-r19-db:5432/athyper_${p}`;}
for(const flag of ['AUTHORING','COMPILE','DISPATCH','RECOVERY','APPLY'])env['PUBLICATION_'+flag+'_ENABLED']='false';
writeFileSync(root+'/runtime.env',Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
copyFileSync(root+'/public-key.pem',root+'/public-key.der');
console.log(JSON.stringify({prepared:true,isolatedEndpointCount:9,sourceCredentialsCopied:false}));
