/** Operator-only isolated host. Shared deployment startup never imports this module. */
import {readFileSync} from 'node:fs';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {sql} from 'kysely';
import {loadConfig} from '/app/server/dist/config/index.js';
import {createContainer} from '/app/server/dist/composition/create-container.js';
import {registerAdapters} from '/app/server/dist/composition/register-adapters.js';
import {registerPlatform} from '/app/server/dist/composition/register-platform.js';
import {registerRuntimes,startRuntimes} from '/app/server/dist/composition/register-runtimes.js';
import {registerServices} from '/app/server/dist/composition/register-services.js';
import {createLifecycle} from '@athyper/server-foundation/lifecycle';
import {createHttpApplication} from '@athyper/server-runtime-http';
import {VerifiedPublicationArtifactLoader,KyselyLocalProjectionRepository} from '@athyper/server-service-publication';
import {Ed25519PublicationVerifier,canonicalBytes,sha256} from '@athyper/server-adapter-publication-signing';
import {createIamAuthenticationMiddleware,readVerifiedRequestContext} from '@athyper/server-platform-iam';
import {registerBusinessPartnerGovernedImportRoutes} from '/app/server/node_modules/@athyper/server-service-master-data/dist/business-partner-governed-import-routes.js';
import {createEntityBackendAuthorizer} from '@athyper/server-service-records';
import {createBusinessPartnerBackendMapping} from '/app/server/dist/composition/business-partner-backend-mapping.js';
import {createBusinessPartnerStoredScopes} from '/app/server/dist/composition/business-partner-stored-scopes.js';
import {createEntityCasePreflight} from '/app/server/dist/composition/entity-case-preflight.js';
import {qualificationPreflight} from '/app/server/dist/composition/business-partner-qualification-runtime.js';
import {createKyselyContextRefresh} from '/app/server/node_modules/@athyper/server-platform-iam/dist/kysely-context-refresh.js';
import {registerAiRetrieval} from './ai-retrieval.mjs';
import {governedImportPolicy} from './import-policy.mjs';
import {caseAwareMapping,caseAwareAuthority} from './case-bindings.mjs';
import {createBusinessPartnerCaseRuntimeRegistrations} from '/app/server/dist/composition/business-partner-case-runtime.js';
import {artifactHash,releaseId,assertIsolatedEnvironment,bindJobRuntime,requestBoundary} from './release-boundary.mjs';
assertIsolatedEnvironment(process.env);
const config=loadConfig(),container=createContainer(),lifecycle=createLifecycle();
registerAdapters(container,config,lifecycle);registerRuntimes(container,config,lifecycle);registerPlatform(container,config);
const bytes=readFileSync('/release/artifact.json'),document=JSON.parse(bytes),m=document.manifest,d=document.envelope.payload.entityDescriptor;
if(sha256(bytes)!==artifactHash||m.releaseId!==releaseId)throw Error('PINNED_ARTIFACT_MISMATCH');
const release={entityCode:'business_partner',planeKey:'neon',descriptorHash:d.compiledHash,profileHash:sha256(canonicalBytes(d.descriptor.authorization)),bindingsHash:sha256(canonicalBytes(d.descriptor.authorizationRuntime)),runtimeVersion:d.descriptor.authorizationRuntime.runtimeVersion};
const db=container.adapters.neonDatabase.database;
let verified=false;
const emit=e=>console.log(JSON.stringify({...e,instance:'bp-release19-isolated',mode:config.mode}));
const assertCurrent=async()=>{
 assertIsolatedEnvironment(process.env);if(process.env.BP_IAM_TRUST_EXPIRES_AT&&!(Date.now()<Date.parse(process.env.BP_IAM_TRUST_EXPIRES_AT)))throw Error('IAM_TRUST_REFRESH_REQUIRED');if(!verified)throw Error('ARTIFACT_NOT_VERIFIED');
 const result=await sql`SELECT h.artifact_hash,h.source_release_no FROM runtime_meta.release_activation_head h WHERE publication_key=${m.publicationKey}`.execute(db);
 if(result.rows.length!==1||result.rows[0].artifact_hash!==artifactHash||Number(result.rows[0].source_release_no)!==19)throw Error('ACTIVE_RELEASE_MISMATCH');
};
const casePreflight=createEntityCasePreflight(db);
const storedCaseScopes=createBusinessPartnerStoredScopes(db,casePreflight);
const caseRegistration=key=>createBusinessPartnerCaseRuntimeRegistrations(container.services.businessPartnerRequests,storedCaseScopes).find(r=>r.operation.key===key);
const preflight=async input=>{
 const services=container.services;
 if(input.operationKey.startsWith('case_'))return caseRegistration(input.operationKey)?.preflight?.check(input)??'not_applicable';
 if(['qualification','qualification_company'].includes(input.operationKey))return services.businessPartnerEligibility?qualificationPreflight(services.businessPartnerEligibility,input):'not_applicable';
 if(['bank_reveal','tax_reveal'].includes(input.operationKey))return input.recordId?services.businessPartner360?.preflightReveal?.({context:input.context,businessPartnerId:input.recordId,kind:input.operationKey==='bank_reveal'?'bank':'tax',historical:input.historical})??'not_applicable':'not_applicable';
 if(input.operationKey==='import')return services.businessPartnerGovernedImport?.preflight(input)??'not_applicable';
 if(input.operationKey==='export'){if(input.historical||!services.records?.transfers)return'workflow_blocked';await services.records.transfers.preflightExport(input.context,'business_partner',{...(input.coordinates?{scopeCoordinate:input.coordinates}:{})});return'allowed';}
 return casePreflight(input);
};
const wrapAuthority=authority=>{const backend=createEntityBackendAuthorizer({authority:caseAwareAuthority(authority,d.descriptor.authorization),profile:d.descriptor.authorization,...caseAwareMapping(createBusinessPartnerBackendMapping(d.descriptor.authorization),d.descriptor.authorization),rollout:{schemaVersion:1,mode:'enforce',release,qualificationRef:'isolated-experiment-not-production-qualification'},scopes:{preflight,resolve:input=>input.operationKey.startsWith('case_')?caseRegistration(input.operationKey).resolver.resolve(input):createBusinessPartnerStoredScopes(db,preflight).resolve(input)},refreshContext:createKyselyContextRefresh({run:(_identity,work)=>db.transaction().execute(work)}),currentRelease:async()=>{await assertCurrent();return release;},verifyQualification:async()=>null,currentRevocationWatermark:async()=>{throw Error('NOT_PRODUCTION_QUALIFIED');},writeShadow:async()=>{},diagnostic:code=>emit({kind:'diagnostic',code}),isolatedExecution:{diagnostic:event=>emit({kind:'isolated_target_decision',...event}),assertCurrent:async candidate=>{if(JSON.stringify(candidate)!==JSON.stringify(release))throw Error('ISOLATED_RELEASE_MISMATCH');await assertCurrent();}}});
return {...backend,authorize:async request=>{const result=await backend.authorize(request);if(!result.allowed)emit({kind:'isolated_authorization_denial',permission:request.permissionCode,reason:result.reason});return result;}};};
bindJobRuntime(container.runtimes.jobs,assertCurrent,emit);
registerServices(container,{isolatedExecutionAuthority:wrapAuthority,isolatedExecutionImportPolicy:governedImportPolicy(input=>container.services.businessPartnerGovernedImport.preflight(input))},config);
container.platform.authorizer=wrapAuthority(container.platform.authorizer);
container.platform.httpRegistrars.push(app=>registerBusinessPartnerGovernedImportRoutes(app,{authenticate:createIamAuthenticationMiddleware(container.platform.iam),readContext:readVerifiedRequestContext,service:container.services.businessPartnerGovernedImport}));
container.platform.httpRegistrars.push(app=>registerAiRetrieval(app,{authenticate:createIamAuthenticationMiddleware(container.platform.iam),readContext:readVerifiedRequestContext,refresh:createKyselyContextRefresh({run:(_identity,work)=>db.transaction().execute(work)}),metadata:container.platform.metadata,records:container.services.records.queries,authorizer:container.platform.authorizer,descriptorHash:d.compiledHash}));
const publicKey=readFileSync('/release/public-key.der');
const verifier=new Ed25519PublicationVerifier({verificationKeys:async key=>{if(key!==m.signingKeyId)throw Error('UNTRUSTED_SIGNING_KEY');return[publicKey];}});
const deployment={deploymentId:'bbc6e177-1964-4b04-9866-919191919191',artifactUri:'isolated://artifact',artifactHash,sourceReleaseId:releaseId,sourceReleaseNo:19,publicationKey:m.publicationKey,targetPlane:'neon',signatureAlgorithm:m.signatureAlgorithm,signingKeyId:m.signingKeyId,signature:document.signature};
const loader=new VerifiedPublicationArtifactLoader({store:{get:async()=>bytes},verifier,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion,authorizationRuntime:container.services.bpAuthorizationCompilation.runtime});
const loaded=await loader.load(deployment);
if(process.env.ISOLATED_STAGE==='true'){
 await db.transaction().execute(async tx=>{
  await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true)`.execute(tx);
  await sql`ALTER TABLE runtime_meta.release_activation_head DISABLE TRIGGER bp_release19_activation_hold`.execute(tx);
  const repository=new KyselyLocalProjectionRepository(tx);
  const stage=await repository.stage({deployment,artifact:loaded.document});
  await repository.verify({appliedReleaseId:stage.id,computedArtifactHash:artifactHash,evidence:loaded.verification});
  await repository.activate({appliedReleaseId:stage.id,evidence:{isolatedExecution:true,sharedDevActivationAuthorized:false}});
  await sql`ALTER TABLE runtime_meta.release_activation_head ENABLE TRIGGER bp_release19_activation_hold`.execute(tx);
 });
 emit({kind:'isolated_projection_installed',releaseId,artifactHash});process.exit(0);
}
verified=true;await assertCurrent();
const activeDescriptor=async()=>{await assertCurrent();const result=await new KyselyLocalProjectionRepository(db).findActiveEntity(m.publicationKey);if(result?.releaseId!==releaseId||result?.compiledHash!==d.compiledHash)throw Error('ACTIVE_DESCRIPTOR_MISMATCH');return{releaseId,artifactHash,descriptorHash:result.compiledHash,operationCount:result.descriptor.authorization.operations.length};};
container.runtimes.jobs.register('bp-r19-qualification','read-active-descriptor',{async handle(){const result=await activeDescriptor();emit({kind:'isolated_descriptor_job_result',...result});return{status:'completed'};}});
const authenticateOperator=(req,res,next)=>{const given=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+process.env.ISOLATED_OPERATOR_TOKEN);if(given.length!==expected.length||!timingSafeEqual(given,expected))return res.status(401).json({code:'OPERATOR_AUTH_REQUIRED'});next();};
let ready=false;
if(config.mode==='api'){
 const app=createHttpApplication({isReady:()=>ready,environment:config.env,configure(app){
  app.use((req,res,next)=>ready?next():res.status(503).json({code:'ISOLATED_HOST_STARTING'}));
  app.use(requestBoundary(assertCurrent,emit));
  app.get('/isolated/execution',authenticateOperator,async(req,res)=>res.json(await activeDescriptor()));
  app.post('/isolated/execution/jobs',authenticateOperator,async(req,res)=>{const id=await container.runtimes.jobs.enqueue('bp-r19-qualification','read-active-descriptor',{});res.status(202).json({jobId:id,artifactHash,releaseId});});
  for(const registrar of container.platform.httpRegistrars)registrar(app);
 }});
 const server=createServer(app);await new Promise(resolve=>server.listen(config.port,resolve));
 lifecycle.onShutdown(()=>new Promise(resolve=>server.close(resolve)));
}
await lifecycle.signalReady({failOnError:true});await startRuntimes(container,config.mode);ready=true;
emit({kind:'isolated_host_ready',releaseId,artifactHash,descriptorHash:d.compiledHash,targetAuthorization:true,productionQualification:false});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await lifecycle.shutdown(signal);process.exit(0);});
