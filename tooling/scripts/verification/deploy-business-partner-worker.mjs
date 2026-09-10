/** Bounded worker patch on the running image. Candidate smoke never starts queues. */
import{readFileSync,writeFileSync,mkdirSync,existsSync,rmSync}from'node:fs';import{homedir}from'node:os';import{join,dirname,resolve,relative}from'node:path';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
import ts from'typescript';
const apply=process.argv.includes('--apply');
const run=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const before=JSON.parse(run(['inspect','athyper-dev-worker-1']))[0];
const root=join(homedir(),'.athyper/instances/dev/deployments/bp-release-19-worker-20260910');mkdirSync(root,{recursive:true,mode:0o700});
const changes=new Map();const add=(destination,bytes)=>{const name='file-'+changes.size+'.js';writeFileSync(join(root,name),bytes);changes.set(destination,{name,destination,sha256:createHash('sha256').update(bytes).digest('hex')});};
const extract=path=>run(['exec','athyper-dev-worker-1','node','--input-type=module','-e',`import{readFileSync}from'node:fs';process.stdout.write(readFileSync(${JSON.stringify(path)},'utf8'));`]);
const destination=(kind,name)=>`/app/server/node_modules/.pnpm/@athyper+server-${kind}-${name}@file+server+packages+${kind==='service'?'services':kind==='contract'?'contracts':'platform'}+${name}/node_modules/@athyper/server-${kind}-${name}/dist`;
const copied=new Set();function closure(local,dest,entry){const path=resolve(local,entry),target=resolve(dest,entry);if(copied.has(target))return;copied.add(target);const bytes=readFileSync(path,'utf8');add(target,bytes);for(const m of bytes.matchAll(/(?:from\s*|import\s*\()\s*["'](\.[^"']+\.js)["']/g))closure(local,dest,relative(local,resolve(dirname(path),m[1])));}
function packageFiles(kind,name,entries){const local=`server/packages/${kind==='service'?'services':kind==='contract'?'contracts':'platform'}/${name}/dist`,dest=destination(kind,name);for(const e of entries)closure(local,dest,e);return dest;}
function exportsFor(dest,entries){let index=extract(dest+'/index.js');for(const entry of entries)if(!index.includes(`"./${entry}"`)&&!index.includes(`'./${entry}'`))index+=`\nexport * from "./${entry}";\n`;add(dest+'/index.js',index);}
const metadata=packageFiles('contract','metadata',['entity-authorization.js','entity-authorization-runtime.js','entity-authorization-registry.js']);exportsFor(metadata,['entity-authorization.js','entity-authorization-runtime.js','entity-authorization-registry.js']);
const master=packageFiles('service','master-data',['business-partner-request-service.js','kysely-business-partner-case-repository.js','business-partner-360-service.js','kysely-business-partner-360-repository.js','business-partner-eligibility-service.js','kysely-business-partner-eligibility-repository.js','business-partner-governed-import.js']);exportsFor(master,['business-partner-governed-import.js']);
packageFiles('contract','master-data',['business-partner-request-ports.js','business-partner-360.js','business-partner-eligibility.js']);
const records=packageFiles('service','records',['entity-authorization.js','transfer/transfer-service.js']);exportsFor(records,['entity-authorization.js']);
const iam=packageFiles('platform','iam',['kysely-context-refresh.js']);exportsFor(iam,['kysely-context-refresh.js']);
const publication=packageFiles('service','publication',['kysely-publication-authority-work.js','entity-authorization-compiler.js','authenticated-entity-release-review.js','file-entity-release-review-store.js']);exportsFor(publication,['authenticated-entity-release-review.js','file-entity-release-review-store.js']);
const host='/app/server/dist/composition',localHost='server/apps/platform-host/dist/composition';
for(const name of ['business-partner-case-runtime','business-partner-read-runtime','business-partner-action-runtime','business-partner-import-runtime','business-partner-bound-import','business-partner-export-runtime','business-partner-reveal-runtime','business-partner-qualification-runtime','business-partner-stored-scopes','entity-case-preflight','entity-release-review-deployment'])closure(localHost,host,name+'.js');
let composition=extract(host+'/register-services.js');
const replace=(a,b)=>{if(composition.split(a).length!==2)throw Error('Worker composition changed: '+a.slice(0,70));composition=composition.replace(a,b);};
const local=readFileSync('server/apps/platform-host/src/composition/register-services.ts','utf8');
const ast=ts.createSourceFile('source.ts',local,ts.ScriptTarget.Latest,true);let compilerArg;function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='registerPublication'&&node.arguments.length===7)compilerArg=node.arguments[6].getText(ast);ts.forEachChild(node,visit);}visit(ast);if(!compilerArg)throw Error('Native publication config missing');
const transpile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const authConfig=transpile('const bpAuthorizationCompilation='+compilerArg+';');
const helpers=local.slice(local.indexOf('  const refreshEntityContext ='),local.indexOf('  const observeAuthority ='));
replace('    const observeAuthority =',transpile(helpers)+'    const observeAuthority =');
replace('        registerPublication(container, config, {',authConfig+'        registerPublication(container, config, {');
replace('        }, iam, authorizer, audit);','        }, iam, authorizer, audit, bpAuthorizationCompilation);');
replace('function registerPublication(container, config, databases, iam, authorizer, audit) {','function registerPublication(container, config, databases, iam, authorizer, audit, authorizationCompilation) {\n container.services.bpAuthorizationCompilation=authorizationCompilation;');
replace('        const work = new KyselyPublicationAuthorityWork({','        const work = new KyselyPublicationAuthorityWork({\n authorizationCompilation,');
replace('        const businessPartnerRequests = createBusinessPartnerRequestService({','        container.services.businessPartner360=businessPartner360;\n        const businessPartnerRequests = createBusinessPartnerRequestService({');
replace('    container.services.records = {','    container.services.records = {\n surfaces: lists,');
replace('        container.services.businessPartnerRequests = businessPartnerRequests;','        container.services.businessPartnerRequests = businessPartnerRequests;\n container.services.businessPartnerGovernedImport=createBusinessPartnerBoundImport({requests:businessPartnerRequests,metadata,authorizer:businessPartnerAuthorizer,scopes:caseScopes(),refreshContext:refreshEntityContext});');
// Supply the upgraded provider its real existing-case owner and current authority.
replace('        const businessPartner360 = createBusinessPartner360Service({','        const businessPartner360 = createBusinessPartner360Service({\n refreshAuthorizationContext:refreshEntityContext,\n authorizeCaseRead:async(query,caseId)=>{const cases=container.services.businessPartnerRequests;if(!cases)throw new MasterDataError(503,"BP_CHILD_AUTHORIZATION_UNAVAILABLE","Case owner unavailable");try{await cases.get({context:query.context,requestId:caseId});return true;}catch(error){if(error instanceof MasterDataError&&(error.status===403||error.status===404))return false;throw error;}},');
const imports=local.split('\n').filter(l=>l.startsWith('import ')&&(/createBusinessPartner(?:QualificationRuntime|RevealRuntime|CaseRuntime|ReadRuntime|ActionRuntime|BoundImport|ExportRegistration|StoredScopes)|createEntityCasePreflight|createKyselyContextRefresh|createEntityAuthorizationRuntimeRegistry|createAuthenticatedEntityReleaseReview/.test(l))).join('\n');
composition=imports+"\n"+composition;add(host+'/register-services.js',composition);
add('/app/server/dist/processes/worker/index.js',readFileSync('server/apps/platform-host/dist/processes/worker/index.js'));
const tag='athyper-runtime-server:bp-release-19-worker';const baseTag='athyper-runtime-server:bp-worker-base-'+before.Image.slice(7,19);run(['tag',before.Image,baseTag]);writeFileSync(join(root,'Dockerfile'),`FROM ${baseTag}\n`+[...changes.values()].map(c=>`COPY ${c.name} ${c.destination}`).join('\n')+'\n');run(['build','-t',tag,root],{timeout:120000});
run(['run','--rm','--entrypoint','node',tag,'--input-type=module','-e','await import("/app/server/dist/composition/register-services.js");await import("/app/server/dist/processes/worker/index.js");'],{timeout:30000});
const imageId=run(['image','inspect','--format','{{.Id}}',tag]).trim();
const report={schemaVersion:1,kind:'bp_worker_candidate',capturedAt:new Date().toISOString(),baseImage:before.Image,imageId,changes:[...changes.values()],moduleLoadPassed:true,applied:false,grantsChanged:false,activationAuthorized:false};writeFileSync('governance/policy/reports/business-partner-worker-candidate.dev.json',JSON.stringify(report,null,2)+'\n');console.log({imageId,files:changes.size,moduleLoadPassed:true,applied:false});
if(apply)throw Error('Candidate runtime smoke required before deployment');
