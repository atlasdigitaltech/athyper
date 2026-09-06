#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const phase=process.argv.find(value=>value.startsWith('--phase='))?.slice(8);
if (!['secretstore','worker','api','studio-web','neon-web','mesh-web','check'].includes(phase)) throw new Error('Use --phase=secretstore, worker, api, studio-web, neon-web, mesh-web or check');
if (phase!=='check' && !process.argv.includes('--confirm=LOCAL-DEV-PUBLICATION')) throw new Error('Local development confirmation required');
const runtimeRoot=join(homedir(),'.athyper');
const ddl=join(process.cwd(),'server/db/ddl'),hash=createHash('sha256');
function visit(dir) {
  for (const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path=join(dir,entry.name);
    if(entry.isDirectory())visit(path);
    else if(entry.isFile())hash.update(path.slice(ddl.length+1)).update('\0').update(readFileSync(path)).update('\0');
  }
}
visit(ddl);
const env={...process.env,ATHYPER_RUNTIME_ROOT:runtimeRoot,ATHYPER_RUNTIME_UID:String(process.getuid()),ATHYPER_RUNTIME_GID:String(process.getgid()),ATHYPER_INSTANCE:'dev',ATHYPER_DOMAIN_SUFFIX:'dev.athyper.test',ATHYPER_DDL_SHA256:hash.digest('hex')};
const files=['compose.yaml','compose.parity.yaml','compose.optional.yaml','compose.publication-secretstore.yaml'];
if (phase!=='secretstore') {
  const path=join(runtimeRoot,'instances/dev/secrets/publication-environment.json');
  if (!existsSync(path)) throw new Error('Bootstrap development signing before starting the worker');
  const refs=JSON.parse(readFileSync(path,'utf8'));
  const allowed=new Set(['PUBLICATION_APPLIER_PRINCIPAL_CODE','PUBLICATION_TARGET_PLANES','PUBLICATION_RUNTIME_VERSION','PUBLICATION_SIGNING_KEY_ID','PUBLICATION_PRIVATE_KEY_REFERENCE','PUBLICATION_PUBLIC_KEY_REFERENCE','INFISICAL_URL','INFISICAL_WORKSPACE_ID','INFISICAL_ENVIRONMENT','INFISICAL_SECRET_PATH','PUBLICATION_INFISICAL_TOKEN_FILE']);
  for (const [key,value] of Object.entries(refs)) {
    if (!allowed.has(key) || typeof value!=='string' || !value) throw new Error('Invalid publication reference configuration');
    env[key]=value;
  }
  if(refs.INFISICAL_ENVIRONMENT!=='dev' || refs.INFISICAL_URL!=='https://secrets.dev.athyper.test:8443') throw new Error('Development signing environment mismatch');
  env.ATHYPER_IMAGE_RUNTIME_SERVER='athyper-runtime-server:publication-dev';
  if (phase==='studio-web') env.ATHYPER_IMAGE_STUDIO_WEB='athyper-studio-web:publication-dev';
  if (phase==='neon-web') env.ATHYPER_IMAGE_NEON_WEB='athyper-neon-web:publication-dev';
  if (phase==='mesh-web') env.ATHYPER_IMAGE_MESH_WEB='athyper-mesh-web:publication-dev';
  files.push('compose.publication.yaml','compose.publication-local-trust.yaml');
}
const args=['compose','-p','athyper-dev'];
for(const file of files)args.push('-f','deploy/compose/instance/'+file);
args.push('--profile','secretstore');
if(phase==='check')args.push('config','--quiet');
else if(phase==='secretstore')args.push('up','-d','--no-deps','secretstore','publication-secretstore-tls');
else args.push('up','-d','--no-deps',phase);
const result=spawnSync('docker',args,{env,stdio:'inherit'});
process.exitCode=result.status??1;
