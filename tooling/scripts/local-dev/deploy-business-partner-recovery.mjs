/** Preserve the active DEV configuration; replace only the scoped recovery images. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = '/home/chandravel_natarajan/.athyper/backups/bp-publication-recovery-20260924';
const verifiedSource = process.argv.includes('--verified-source');
const successor = process.argv.includes('--successor') || verifiedSource;
const provenance = process.argv.includes('--provenance') || successor;
if(process.argv.slice(2).some(arg=>!['--provenance','--successor','--verified-source'].includes(arg)))throw Error('UNKNOWN_ARGUMENT');
const prefix = verifiedSource ? 'verified-source-' : successor ? 'successor-' : provenance ? 'provenance-' : '';
const names = provenance ? ['api','worker','scheduler'] : ['api','worker','scheduler','neon-web'];
const containers = JSON.parse(execFileSync('docker',['inspect',...names.map(name=>`athyper-dev-source-${name}-1`)],{encoding:'utf8'}));
const files = new Set(containers.map(c=>c.Config.Labels['com.docker.compose.project.config_files']));
if(files.size!==1 || containers.some(c=>c.Config.Labels['com.docker.compose.project']!=='athyper-dev-source'))throw Error('DEV_TOPOLOGY_CHANGED');
const original = [...files][0];
if(!original || original.includes(','))throw Error('SINGLE_CONFIG_REQUIRED');
const bytes=readFileSync(original), config=JSON.parse(bytes);
if(config.name!=='athyper-dev-source')throw Error('DEV_PROJECT_REQUIRED');
writeFileSync(root+'/'+prefix+'previous.compose.json',bytes,{mode:0o600,flag:'wx'});
for(const name of names){
  const tag=verifiedSource?'athyper/runtime-server:provenance-verified-source-20260924':successor?'athyper/runtime-server:provenance-successor-20260924':provenance?'athyper/runtime-server:provenance-recovery-20260924':name==='neon-web'?'athyper/neon-web:bp-recovery-20260924':'athyper/runtime-server:bp-recovery-20260924';
  config.services[name].image=execFileSync('docker',['image','inspect','--format','{{.Id}}',tag],{encoding:'utf8'}).trim();
  config.services[name].pull_policy='never';
}
const next=root+'/'+prefix+'active.compose.json';
writeFileSync(next,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
execFileSync('docker',['compose','-p','athyper-dev-source','-f',next,'up','-d','--no-deps',...names],{stdio:'inherit'});
const modePath='/home/chandravel_natarajan/.athyper/instances/dev/workspace/mode.json';
if(existsSync(modePath)){
 const modeBytes=readFileSync(modePath),mode=JSON.parse(modeBytes);
 if(mode.mode==='container'){
  writeFileSync(root+'/'+prefix+'previous-mode.json',modeBytes,{mode:0o600,flag:'wx'});
  writeFileSync(modePath,JSON.stringify({...mode,composeFile:next,at:new Date().toISOString()},null,2)+'\n',{mode:0o600});
 }
}
console.log('DEV recovery images deployed; QA and other web applications unchanged.');
