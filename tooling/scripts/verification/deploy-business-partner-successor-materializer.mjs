/** Targeted API-only successor preparation. No publish or activation calls. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const apply=process.argv.includes('--apply');if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Invalid argument');
const run=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const before=JSON.parse(run(['inspect','athyper-dev-api-1']))[0];
const receiptPath='governance/policy/reports/business-partner-successor-deployment.dev.json';
if(existsSync(receiptPath)){const prior=JSON.parse(readFileSync(receiptPath));if(prior.applied){if(before.Image!==prior.imageId)throw Error('API image changed after deployment');console.log({alreadyApplied:true,imageId:prior.imageId});process.exit(0);}}
const previous=JSON.parse(readFileSync('governance/policy/reports/business-partner-authoring-compiler.dev.json'));
if(![previous.imageId,'sha256:de3bee854f93376a05c67465c4425e9055ce2ac7590bb4f66d8fa16829f51a87'].includes(before.Image))throw Error('Running Atlas/compiler base changed; rebase the patch');
const root=join(homedir(),'.athyper/instances/dev/deployments/bp-successor-materializer-20260910');mkdirSync(root,{recursive:true,mode:0o700});
const authoring='/app/server/node_modules/.pnpm/@athyper+server-plane-studio-meta-entity-authoring@file+server+packages+planes+studio+meta-entity-authoring/node_modules/@athyper/server-plane-studio-meta-entity-authoring/dist';
const extract=path=>run(['exec','athyper-dev-api-1','node','--input-type=module','-e',`import{readFileSync}from'node:fs';process.stdout.write(readFileSync(${JSON.stringify(path)},'utf8'));`]);
const changes=[];const add=(name,destination,content)=>{writeFileSync(join(root,name),content);changes.push({name,destination,sha256:createHash('sha256').update(content).digest('hex')});};
for(const name of ['authorization-successor.js','authorization-successor-publication.js'])add(name,authoring+'/'+name,readFileSync('server/packages/planes/studio/meta-entity-authoring/dist/'+name));
add('authoring-index.js',authoring+'/index.js',extract(authoring+'/index.js')+'\nexport * from "./authorization-successor.js";\nexport * from "./authorization-successor-publication.js";\n');
const metadata='/app/server/node_modules/.pnpm/@athyper+server-contract-metadata@file+server+packages+contracts+metadata/node_modules/@athyper/server-contract-metadata/dist';
const priorRoot=join(homedir(),'.athyper/instances/dev/deployments/bp-authoring-compiler-20260910');
for(const [name,destination] of [['profile.js',metadata+'/entity-authorization.js'],['runtime.js',metadata+'/entity-authorization-runtime.js'],['authoring.js',authoring+'/entity-authorization.js']])add(name,destination,readFileSync(join(priorRoot,name)));
let metadataIndex=extract(metadata+'/index.js');if(!metadataIndex.includes('entity-authorization-runtime.js'))metadataIndex+='\nexport * from "./entity-authorization-runtime.js";\n';add('metadata-index.js',metadata+'/index.js',metadataIndex);
let compiler=extract(authoring+'/deterministic.js');
if(!compiler.includes('compileEntityAuthorizationRuntime')){
 for(const [old,replacement] of [
 ['import { compileEntityAuthorization }','import { compileEntityAuthorization, compileEntityAuthorizationRuntime }'],
 ['        compileEntityAuthorization(graph);','        compileEntityAuthorization(graph);\n        compileEntityAuthorizationRuntime(graph);'],
 ['    const authorization = compileEntityAuthorization(graph);','    const authorization = compileEntityAuthorization(graph);\n    const authorizationRuntime = compileEntityAuthorizationRuntime(graph);'],
 ['        ...(authorization ? { authorization } : {}),','        ...(authorization ? { authorization } : {}),\n        ...(authorizationRuntime ? { authorizationRuntime } : {}),']]){
 if(compiler.split(old).length!==2)throw Error('Current Atlas compiler shape changed');compiler=compiler.replace(old,replacement);
 }
}
add('deterministic.js',authoring+'/deterministic.js',compiler);
const host='/app/server/dist/composition/register-services.js';let composition=extract(host);
const beforeCall='    const prepared = await prepareInitialBaselineRelease(tx, input,';
if(composition.split(beforeCall).length!==2)throw Error('Host publication hook changed');
// Transpile only the newly added callback to avoid unrelated workspace changes.
const ts=await import('typescript');const local=readFileSync('server/apps/platform-host/src/composition/register-services.ts','utf8');
const start=local.indexOf('    const successor = await prepareAuthorizationSuccessorRelease');const end=local.indexOf('    const prepared = await prepareInitialBaselineRelease',start);
if(start<0||end<start)throw Error('Missing successor callback');
const callback=ts.transpileModule(local.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
composition='import { prepareAuthorizationSuccessorRelease, baselineJsonHash } from "@athyper/server-plane-studio";\n'+composition.replace(beforeCall,callback+beforeCall);
add('register-services.js',host,composition);
const baseTag='athyper-runtime-server:bp-successor-base-'+before.Image.slice(7,19);run(['tag',before.Image,baseTag]);
writeFileSync(join(root,'Dockerfile'),`FROM ${baseTag}\n`+changes.map(c=>`COPY ${c.name} ${c.destination}`).join('\n')+'\n');
const tag='athyper-runtime-server:bp-successor-materializer-20260910';run(['build','-t',tag,root],{timeout:120000});
run(['run','--rm','--entrypoint','node',tag,'--check',host],{timeout:30000});
run(['run','--rm','--entrypoint','node',tag,'--input-type=module','-e',`const m=await import(${JSON.stringify(authoring+'/index.js')});if(typeof m.prepareAuthorizationSuccessorRelease!=='function')throw Error('Missing materializer');`],{timeout:30000});
const approved=JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-persisted-approval.dev.json'));
const native=JSON.parse(run(['run','--rm','-i','--entrypoint','node',tag,'--input-type=module','-e',`import{compileGraph,validateGraph}from${JSON.stringify(authoring+'/deterministic.js')};let text='';for await(const c of process.stdin)text+=c;const graph=JSON.parse(text);if(validateGraph(graph).issues.length)throw Error('Approved graph no longer validates');const compiled=compileGraph(graph);if(!compiled.descriptor.authorizationRuntime)throw Error('Runtime omitted');console.log(JSON.stringify({contractHash:compiled.contractHash}));`],{input:JSON.stringify(approved.persistedGraph),timeout:30000}));
if(native.contractHash!==approved.persistedNativeContractHash)throw Error('Approved native contract changed in candidate image');
const imageId=run(['image','inspect','--format','{{.Id}}',tag]).trim();const sourceConfig=before.Config.Labels['com.docker.compose.project.config_files'].split(',');
writeFileSync(join(root,'override.json'),JSON.stringify({services:{api:{image:imageId}}},null,2)+'\n',{mode:0o600});writeFileSync(join(root,'rollback.json'),JSON.stringify({services:{api:{image:before.Image}}},null,2)+'\n',{mode:0o600});
if(apply){
 const rehearsal=JSON.parse(readFileSync('governance/policy/reports/business-partner-successor-sql.dev.json'));if(!rehearsal.rolledBack||!rehearsal.checks.transactionalMaterialization)throw Error('SQL rehearsal required');
 let migration=readFileSync('server/db/scripts/operations/upgrades/publication/20260910_authorization_successor_materializer.sql','utf8');const proposal=JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-successor.dev.json'));
 const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
 migration=migration.replace(/COMMIT;\s*$/,`SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';\nINSERT INTO publication.entity_authorization_successor_payload(content_hash,tenant_id,descriptor) VALUES(${lit(proposal.descriptorHash)},'44444444-4444-4444-8444-444444444444',${lit(JSON.stringify(proposal.descriptor))}::jsonb);\nCOMMIT;`);
 if(JSON.parse(run(['inspect','athyper-dev-api-1']))[0].Image!==before.Image)throw Error('Running API changed');
 run(['exec','-i','athyper-dev-db-1','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_studio'],{input:migration});
 run(['compose','-p',before.Config.Labels['com.docker.compose.project'],...sourceConfig.flatMap(p=>['-f',p]),'-f',join(root,'override.json'),'up','-d','--no-deps','--no-build','api'],{timeout:60000});
}
const report={schemaVersion:1,kind:'bp_successor_materializer_deployment',capturedAt:new Date().toISOString(),baseImage:before.Image,imageId,changes,applied:apply,apiOnly:true,rollback:join(root,'rollback.json'),sqlRollback:'Leave inert immutable payload/schema installed; restore prior API image. Never remove grants or restore grant snapshots.',grantsChanged:false,publicationCreated:false,activationAuthorized:false};writeFileSync(receiptPath,JSON.stringify(report,null,2)+'\n');console.log({imageId,applied:apply,apiOnly:true});
