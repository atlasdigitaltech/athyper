const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),os=require('node:os'),ts=require(process.cwd()+'/node_modules/typescript');
const run=(...args)=>cp.execFileSync('docker',args,{encoding:'utf8',stdio:'pipe',maxBuffer:20e6});
const apply=process.argv.includes('--apply');
const c='athyper-dev-api-1',before=JSON.parse(run('inspect',c))[0];
const dir=path.join(os.homedir(),'.athyper/instances/dev/deployments/atlas-mesh-fork-20260910');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const spec=JSON.parse(run('compose',...before.Config.Labels['com.docker.compose.project.config_files'].split(',').flatMap(f=>['-f',f]),'config','--format','json'));
const escape=v=>typeof v==='string'?v.replaceAll('$','$$'):Array.isArray(v)?v.map(escape):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,escape(v)])):v;
spec.services.api.image=before.Image;delete spec.services.api.build;fs.writeFileSync(dir+'/rollback.json',JSON.stringify(escape(spec)),{mode:0o600});
const source=fs.readFileSync('server/apps/platform-host/src/composition/register-services.ts','utf8');
const from=source.indexOf('const prepared = await prepareInitialBaselineRelease'),to=source.indexOf('if (!prepared)',from);if(from<0||to<0)throw Error('Missing source hook');
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
for(const [name,target,isTs] of [['register-services.js','/app/server/dist/composition/register-services.js',false],['register-services.ts','/app/server/src/composition/register-services.ts',true]]){
 let live=run('exec',c,'cat',target),a=live.indexOf('const prepared = await prepareInitialBaselineRelease'),b=live.indexOf('if (!prepared)',a);if(b<0)b=live.indexOf('void prepared;',a);if(a<0||b<0)throw Error('Live hook mismatch');
 live=live.slice(0,a)+(isTs?source.slice(from,to):transpile(source.slice(from,to)))+live.slice(b);
 fs.writeFileSync(dir+'/'+name,live,{mode:0o600});
}
fs.writeFileSync(dir+'/baseline-publication.js',transpile(fs.readFileSync('server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.ts','utf8')),{mode:0o600});
run('tag',before.Image,'athyper-runtime-server:mesh-fork-base');
fs.writeFileSync(dir+'/Dockerfile',`FROM athyper-runtime-server:mesh-fork-base\nCOPY --chown=node:node register-services.js /app/server/dist/composition/register-services.js\nCOPY --chown=node:node register-services.ts /app/server/src/composition/register-services.ts\nCOPY --chown=node:node baseline-publication.js /app/server/node_modules/.pnpm/@athyper+server-plane-studio-meta-entity-authoring@file+server+packages+planes+studio+meta-entity-authoring/node_modules/@athyper/server-plane-studio-meta-entity-authoring/dist/baseline-publication.js\n`);
const image='athyper-runtime-server:mesh-fork-20260910';fs.writeFileSync(dir+'/build.log',run('build','-t',image,dir),{mode:0o600});
run('run','--rm','--entrypoint','node',image,'--input-type=module','-e','await import("./dist/composition/register-services.js")');
if(JSON.parse(run('inspect',c))[0].Id!==before.Id)throw Error('Deployment changed during build');
spec.services.api.image=image;fs.writeFileSync(dir+'/rollout.json',JSON.stringify(escape(spec)),{mode:0o600});
if(apply)fs.writeFileSync(dir+'/rollout.log',run('compose','-f',dir+'/rollout.json','up','-d','--no-deps','--pull','never','api'),{mode:0o600});
const receipt={observedAt:new Date().toISOString(),applied:apply,baseImage:before.Image,image,moduleImportPassed:true};fs.writeFileSync('docs/examples/atlas-f6/mesh-fork-api.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
