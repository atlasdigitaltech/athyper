/** Reseed the authorized main DEV rebuild; no IAM or permission-policy mutation. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyAuthorizationSeedPack } from '../../../server/db/scripts/provisioning/apply-authorization-seed-pack.js';
if(process.argv[2]!=='--confirm-main-dev')throw Error('Main DEV confirmation required');
const db=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
if(db.Config.Labels['com.docker.compose.project']!=='athyper-dev')throw Error('DEV target required');
const host=(Object.values(db.NetworkSettings.Networks)[0] as any).IPAddress;
for(const plane of (process.argv.includes('--identity-only') ? [] : ['studio','neon','mesh']) as readonly ('studio'|'neon'|'mesh')[]){
 const url=new URL(`postgresql://postgres@${host}:5432/athyper_${plane}`);
 url.password=readFileSync(join(homedir(),'.athyper/instances/dev/secrets/postgres-password'),'utf8').trim();
 try { const result=await applyAuthorizationSeedPack({plane,databaseUrl:url.toString()});console.log(JSON.stringify(result)); }
 catch(e:any){console.error(JSON.stringify({plane,error:e.message,code:e.code}));process.exit(1);}
}
// Rebuilt application databases use fixture subjects; the retained IAM has real
// runtime subjects. Restore bindings before calling this reseed login-ready.
const iam=JSON.parse(execFileSync('docker',['inspect','athyper-dev-iam-1'],{encoding:'utf8'}))[0];
if(iam.Config.Labels['com.docker.compose.project']!=='athyper-dev')throw Error('DEV IAM target required');
const iamHost=(Object.values(iam.NetworkSettings.Networks)[0] as any).IPAddress;
const admin=iam.Config.Env.find((v:string)=>v.startsWith('KC_BOOTSTRAP_ADMIN_USERNAME='))?.split('=').slice(1).join('=');
if(!admin)throw Error('Existing DEV IAM administrator configuration required');
execFileSync('pnpm',['exec','tsx','server/db/scripts/operations/iam/reconcile-runtime-subjects.ts','--apply'],{
 stdio:'inherit',env:{...process.env,POSTGRES_HOST:host,KEYCLOAK_BASE_URL:`http://${iamHost}:8080`,KEYCLOAK_REALM:'athyper',KEYCLOAK_ADMIN_USERNAME:admin,
 KEYCLOAK_ADMIN_PASSWORD_FILE:join(homedir(),'.athyper/instances/dev/secrets/iam-admin-password'),POSTGRES_PASSWORD_FILE:join(homedir(),'.athyper/instances/dev/secrets/postgres-password')},
});
