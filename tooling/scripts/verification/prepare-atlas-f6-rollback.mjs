import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';
import {homedir}from'node:os';import{join}from'node:path';import assert from'node:assert/strict';
const container=JSON.parse(execFileSync('docker',['inspect','athyper-dev-api-1'],{encoding:'utf8',stdio:'pipe'}))[0];
const files=container.Config.Labels['com.docker.compose.project.config_files'].split(',');
assert.ok(files.length);const args=['compose',...files.flatMap(f=>['-f',f]),'config','--format','json'];
// Resolve the actual active Compose files, including other owners' overrides.
// Configuration may contain secrets: retain it only in private owner-only files.
const current=JSON.parse(execFileSync('docker',args,{encoding:'utf8',stdio:'pipe'}));current.services.api.image=container.Image;
const base=join(homedir(),'.athyper/instances/dev/deployments/atlas-f6-pilot-20260910');mkdirSync(base,{recursive:true,mode:0o700});
const rollback=JSON.parse(JSON.stringify(current));const env=rollback.services.api.environment;assert.ok(env.ATLAS_SEMANTIC_RETRIEVAL_CONFIG_PATH);delete env.ATLAS_SEMANTIC_RETRIEVAL_CONFIG_PATH;
const escape=value=>typeof value==='string'?value.replaceAll('$','$$'):Array.isArray(value)?value.map(escape):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,escape(v)])):value;
for(const [name,value] of [['qualified-current.json',current],['qualified-rollback-lexical.json',rollback]])writeFileSync(join(base,name),JSON.stringify(escape(value)),{mode:0o600});
const old='docs/examples/atlas-f6/rollback.json';if(existsSync(old))copyFileSync(old,'docs/examples/atlas-f6/rollback-before-binding-refresh.json');
console.log(JSON.stringify({prepared:true,imageDigest:container.Image,activeComposeFileCount:files.length,secretsPrinted:false}));
