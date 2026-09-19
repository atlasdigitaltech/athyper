/** Compiler-only DEV compatibility patch; no metadata publication or grant writes. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const apply=process.argv.includes('--apply');if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Use --apply or no arguments');
const run=(args,options={})=>{try{return execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});}catch(e){throw Error(`Docker ${args[0]} failed: ${String(e.stderr??e.message).slice(0,1800)}`);}};
const before=JSON.parse(run(['inspect','athyper-dev-api-1']))[0];
const receiptPath='governance/policy/reports/business-partner-authoring-compiler.dev.json';
if(existsSync(receiptPath)){const prior=JSON.parse(readFileSync(receiptPath,'utf8'));if(prior.applied){if(before.Image!==prior.imageId)throw Error('Preserve the installed compiler deployment; author a new deployment revision');console.log({imageId:prior.imageId,alreadyApplied:true,rollbackPreserved:true});process.exit(0);}}
const sourceConfig=before.Config.Labels['com.docker.compose.project.config_files'].split(',');
const root=join(homedir(),'.athyper/instances/dev/deployments/bp-authoring-compiler-20260910');mkdirSync(root,{recursive:true,mode:0o700});
const packages={metadata:'/app/server/node_modules/.pnpm/@athyper+server-contract-metadata@file+server+packages+contracts+metadata/node_modules/@athyper/server-contract-metadata/dist',authoring:'/app/server/node_modules/.pnpm/@athyper+server-plane-studio-meta-entity-authoring@file+server+packages+planes+studio+meta-entity-authoring/node_modules/@athyper/server-plane-studio-meta-entity-authoring/dist'};
const extract=path=>run(['exec','athyper-dev-api-1','node','--input-type=module','-e',`import{readFileSync}from'node:fs';process.stdout.write(readFileSync(${JSON.stringify(path)},'utf8'));`]);
const changes=[];
for(const [name,source,destination]of[
 ['profile.js','server/packages/contracts/metadata/dist/entity-authorization.js',packages.metadata+'/entity-authorization.js'],
 ['runtime.js','server/packages/contracts/metadata/dist/entity-authorization-runtime.js',packages.metadata+'/entity-authorization-runtime.js'],
 ['authoring.js','server/packages/planes/studio/meta-entity-authoring/dist/entity-authorization.js',packages.authoring+'/entity-authorization.js'],
]){copyFileSync(source,join(root,name));changes.push({name,destination,sha256:createHash('sha256').update(readFileSync(source)).digest('hex')});}
let index=extract(packages.metadata+'/index.js');if(!index.includes('entity-authorization-runtime.js'))index+='\nexport * from "./entity-authorization-runtime.js";\n';writeFileSync(join(root,'metadata-index.js'),index);changes.push({name:'metadata-index.js',destination:packages.metadata+'/index.js',sha256:createHash('sha256').update(index).digest('hex')});
let compiler=extract(packages.authoring+'/deterministic.js');
if(!compiler.includes('compileEntityAuthorizationRuntime')){
 const replacements=[
 ['import { compileEntityAuthorization }','import { compileEntityAuthorization, compileEntityAuthorizationRuntime }'],
 ['        compileEntityAuthorization(graph);','        compileEntityAuthorization(graph);\n        compileEntityAuthorizationRuntime(graph);'],
 ['    const authorization = compileEntityAuthorization(graph);','    const authorization = compileEntityAuthorization(graph);\n    const authorizationRuntime = compileEntityAuthorizationRuntime(graph);'],
 ['        ...(authorization ? { authorization } : {}),','        ...(authorization ? { authorization } : {}),\n        ...(authorizationRuntime ? { authorizationRuntime } : {}),'],
 ];
 for(const [old,value]of replacements){if(compiler.split(old).length!==2)throw Error('COMPILER_BASE_CHANGED');compiler=compiler.replace(old,value);}
}
writeFileSync(join(root,'compiler.js'),compiler);changes.push({name:'compiler.js',destination:packages.authoring+'/deterministic.js',sha256:createHash('sha256').update(compiler).digest('hex')});
const baseTag=`athyper-runtime-server:bp-compiler-base-${before.Image.slice(7,19)}`;run(['tag',before.Image,baseTag]);
writeFileSync(join(root,'Dockerfile'),`FROM ${baseTag}\n`+changes.map(c=>`COPY ${c.name} ${c.destination}`).join('\n')+'\n');
const tag='athyper-runtime-server:bp-authoring-compiler-20260910';run(['build','-t',tag,root],{timeout:120000});
const graph=readFileSync('governance/policy/reviews/business-partner-combined-native-graph.dev.json','utf8');
const smoke=JSON.parse(run(['run','--rm','-i','--entrypoint','node',tag,'--input-type=module','-e',`import{validateGraph,compileGraph,runContractTests}from${JSON.stringify(packages.authoring+'/deterministic.js')};let s='';for await(const c of process.stdin)s+=c;const graph=JSON.parse(s),v=validateGraph(graph),t=runContractTests(graph);if(v.issues.length||!t.passed)throw Error(JSON.stringify({v,t}));const c=compileGraph(graph);if(!c.descriptor.authorizationRuntime||c.descriptor.authorization.operations.length!==42||c.descriptor.authorization.deferredOperations.length!==9||!c.descriptor.ai.enabled)throw Error('Compiler omitted selected policy');console.log(JSON.stringify({validated:true,testsPassed:t.passed,contractHash:c.contractHash,operations:c.descriptor.authorization.operations.length}));`],{input:graph,timeout:30000}));
const selection=JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-successor.dev.json','utf8'));if(smoke.contractHash!==selection.nativeCompilerContractHash)throw Error('COMPILER_CONTRACT_HASH_MISMATCH');
const imageId=run(['image','inspect','--format','{{.Id}}',tag]).trim();
writeFileSync(join(root,'override.json'),JSON.stringify({services:{api:{image:imageId}}},null,2)+'\n',{mode:0o600});
writeFileSync(join(root,'rollback.json'),JSON.stringify({services:{api:{image:before.Image}}},null,2)+'\n',{mode:0o600});
const compose=['compose','-p',before.Config.Labels['com.docker.compose.project'],...sourceConfig.flatMap(p=>['-f',p])];
if(apply){if(JSON.parse(run(['inspect','athyper-dev-api-1']))[0].Image!==before.Image)throw Error('RUNNING_IMAGE_CHANGED');run([...compose,'-f',join(root,'override.json'),'up','-d','--no-deps','--no-build','api'],{timeout:60000});}
const report={schemaVersion:1,kind:'bp_authoring_compiler_deployment',at:new Date().toISOString(),baseImage:before.Image,imageId,changes,smoke,applied:apply,sourceConfig,override:join(root,'override.json'),rollback:join(root,'rollback.json'),grantsChanged:false,metadataHeadsChanged:false,activationAuthorized:false};
writeFileSync('governance/policy/reports/business-partner-authoring-compiler.dev.json',JSON.stringify(report,null,2)+'\n');console.log({imageId,smoke,applied:apply,grantsChanged:false});
