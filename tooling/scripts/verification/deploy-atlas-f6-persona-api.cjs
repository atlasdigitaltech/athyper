const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),os=require('node:os'),ts=require(process.cwd()+'/node_modules/typescript');
const run=(...args)=>cp.execFileSync('docker',args,{encoding:'utf8',stdio:'pipe',maxBuffer:20e6});
const apply=process.argv.includes('--apply');
const c='athyper-dev-api-1',before=JSON.parse(run('inspect',c))[0];
const dir=path.join(os.homedir(),'.athyper/instances/dev/deployments/atlas-f6-persona-20260910');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const spec=JSON.parse(run('compose',...before.Config.Labels['com.docker.compose.project.config_files'].split(',').flatMap(f=>['-f',f]),'config','--format','json'));
const escape=v=>typeof v==='string'?v.replaceAll('$','$$'):Array.isArray(v)?v.map(escape):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,escape(v)])):v;
spec.services.api.image=before.Image;delete spec.services.api.build;fs.writeFileSync(dir+'/rollback.json',JSON.stringify(escape(spec)),{mode:0o600});
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
for(const name of ['business-context','kysely-run-repository','entity-record-tool','runtime-tool-coordinator','record-data-gateway'])fs.writeFileSync(dir+'/'+name+'.js',transpile(fs.readFileSync('server/packages/platform/ai/src/'+name+'.ts','utf8')),{mode:0o600});
const aiRoot='/app/server/node_modules/.pnpm/@athyper+server-platform-ai@file+server+packages+platform+ai/node_modules/@athyper/server-platform-ai/dist/';
for(const ext of ['js','ts']){
 const target=ext==='js'?'/app/server/dist/composition/register-services.js':'/app/server/src/composition/register-services.ts';
 let live=run('exec',c,'cat',target);
 if(!live.includes('const atlasMetadata ='))live=live.replace('const localRegistry =', 'const atlasMetadata = {getEntityDescriptor: (context, entityCode) => container.platform.metadata.getEntityDescriptor(context, entityCode)};\nconst localRegistry =');
 if(!live.includes('createAtlasEntityRecordTool(atlasMetadata)')){
 live='import { createAtlasEntityRecordTool } from "@athyper/server-platform-ai";\n'+live;
 live=live.replace('new AtlasToolRegistry([', 'new AtlasToolRegistry([createAtlasEntityRecordTool(atlasMetadata), ');
 live=live.replace('new AtlasRegisteredToolCoordinator(localRegistry, localTools)', 'new AtlasRegisteredToolCoordinator(localRegistry, localTools, atlasMetadata)');
 live=live.replace('context.planeKey === "neon" && localAvailable(manifest.access)', '(context.planeKey === "neon" || manifest.toolCode === "entity_read_record") && localAvailable(manifest.access)');
 const start=live.indexOf('const localTools ='),end=live.indexOf('const localCoordinator',start);
 live=live.slice(0,start)+live.slice(start,end).replaceAll('"neon.ai.agent.use"','`${context.planeKey}.ai.agent.use`').replace('atlas-local-tools-v1','atlas-local-tools-v2')+live.slice(end);
 }
 fs.writeFileSync(dir+'/register-services.'+ext,live,{mode:0o600});
}
let index=run('exec',c,'cat',aiRoot+'index.js');if(!index.includes('./entity-record-tool.js'))index+='\nexport * from "./entity-record-tool.js";\n';fs.writeFileSync(dir+'/ai-index.js',index,{mode:0o600});
run('tag',before.Image,'athyper-runtime-server:f6-persona-base');
fs.writeFileSync(dir+'/Dockerfile',`FROM athyper-runtime-server:f6-persona-base\n`+['business-context','kysely-run-repository','entity-record-tool','runtime-tool-coordinator','record-data-gateway'].map(name=>`COPY --chown=node:node ${name}.js /app/server/node_modules/.pnpm/@athyper+server-platform-ai@file+server+packages+platform+ai/node_modules/@athyper/server-platform-ai/dist/${name}.js\n`).join(''));
fs.appendFileSync(dir+'/Dockerfile',`COPY --chown=node:node register-services.js /app/server/dist/composition/register-services.js\nCOPY --chown=node:node register-services.ts /app/server/src/composition/register-services.ts\nCOPY --chown=node:node ai-index.js ${aiRoot}index.js\n`);
const image='athyper-runtime-server:f6-persona-20260910';fs.writeFileSync(dir+'/build.log',run('build','-t',image,dir),{mode:0o600});
run('run','--rm','--entrypoint','node',image,'--input-type=module','-e','await import("./dist/composition/register-services.js")');
if(JSON.parse(run('inspect',c))[0].Id!==before.Id)throw Error('Deployment changed during build');
spec.services.api.image=image;fs.writeFileSync(dir+'/rollout.json',JSON.stringify(escape(spec)),{mode:0o600});
if(apply)fs.writeFileSync(dir+'/rollout.log',run('compose','-f',dir+'/rollout.json','up','-d','--no-deps','--pull','never','api'),{mode:0o600});
const receipt={observedAt:new Date().toISOString(),applied:apply,baseImage:before.Image,image,moduleImportPassed:true};fs.writeFileSync('docs/examples/atlas-f6/persona-api.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
