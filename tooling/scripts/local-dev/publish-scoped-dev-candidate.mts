/** Internal DEVFULL runner. A trusted local launcher supplies owner-only credentials
 * on stdin; never put them in argv, logs, candidate artifacts or browser state. */
import {readFileSync} from 'node:fs';
import {publishDevelopmentCompiledEntityRuntime} from '../../../server/apps/platform-host/scripts/db-verification/provisioning/publish-development-compiled-entity-runtime.js';
import {loadDevPublicationConfiguration,verifyDevPublicationCredential} from '../../../server/apps/platform-host/src/composition/dev-publication.js';
import {createInfisicalSecretStore} from '../../../server/packages/adapters/secretstore-infisical/src/index.js';
import {CachedPublicationKeyResolver,Ed25519PublicationSigner,Ed25519PublicationVerifier} from '../../../server/packages/adapters/publication-signing/src/index.js';
let store: ReturnType<typeof createInfisicalSecretStore> | undefined;
try {
 const env=process.env;
 if(env.ATHYPER_ENV!=='local'||env.ATHYPER_DOMAIN_SUFFIX!=='dev.athyper.test'||env.ATHYPER_DEV_PRESET!=='devfull')throw Error('DEVFULL_ONLY');
 let data='';for await(const chunk of process.stdin){data+=chunk;if(data.length>32768)throw Error('INPUT_LIMIT');}
 const input=JSON.parse(data), config=loadDevPublicationConfiguration(env,'local');
 if(!config)throw Error('WORKLOAD_CONFIGURATION_REQUIRED');
 if(config.instance!=='dev'||config.entityCode!=='business_partner'||config.tenantCode!=='cirrusatlantic'||config.targets.join(',')!=='neon'||config.author.principalId===config.publisher.principalId)throw Error('WORKLOAD_SCOPE_INVALID');
 for(const role of ['author','publisher'] as const){if(config[role].code!==`dev.metadata.${role}`)throw Error('WORKLOAD_ROLE_INVALID');verifyDevPublicationCredential(input.credentials[role],config[role]);}
 const required=(name:string)=>{const value=env[name];if(!value)throw Error('MISSING_CONFIGURATION_'+name);return value;};
 store=createInfisicalSecretStore({endpoint:required('INFISICAL_URL'),token:readFileSync(required('INFISICAL_TOKEN_FILE'),'utf8').trim(),workspaceId:required('INFISICAL_WORKSPACE_ID'),environment:required('INFISICAL_ENVIRONMENT'),secretPath:env.INFISICAL_SECRET_PATH??'/'});
 const keyId=required('PUBLICATION_SIGNING_KEY_ID');
 const keys=new CachedPublicationKeyResolver(store,[{keyId,privateKeyReference:required('PUBLICATION_PRIVATE_KEY_REFERENCE'),publicKeyReferences:[required('PUBLICATION_PUBLIC_KEY_REFERENCE')]}]);
 const result=await publishDevelopmentCompiledEntityRuntime({neonDatabaseUrl:input.databaseUrl,...(input.overlay === "partner-navigation-display" ? {navigationDisplayOverlay:{sourceSha256:input.sourceSha256}} : {}),...(input.overlay === "partner-status-tones" ? {statusToneOverlay:{sourceSha256:input.sourceSha256}} : {}),...(input.overlay === "partner-qualification-contract" ? {qualificationContractOverlay:{sourceSha256:input.sourceSha256}} : {}),...(input.overlay === "partner-decision-views" ? {decisionViewsOverlay:{sourceSha256:input.sourceSha256}} : {}),...(["partner-company-profiles","partner-capabilities"].includes(input.overlay) ? {companyProfilesOverlay:{sourceSha256:input.sourceSha256,includeCapabilities:input.overlay==="partner-capabilities"}} : {}),entityCode:config.entityCode,authoringRoot:input.authoringRoot,sourceDefinitionReleaseId:input.sourceDefinitionReleaseId,sourceCompiledRelease:input.sourceCompiledRelease===true,candidateOutput:input.candidateOutput,expectedActiveArtifactHash:input.expectedActiveArtifactHash,dryRun:input.dryRun===true,confirmation:'LOCAL-COMPILED-ENTITY-RUNTIME',authority:{tenantId:config.tenantId,entityCode:config.entityCode,author:config.author,publisher:config.publisher,keyId,signer:new Ed25519PublicationSigner(keys),verifier:new Ed25519PublicationVerifier(keys)}});
 console.log(JSON.stringify({...result,signatureAlgorithm:'Ed25519',signingKeyId:keyId,authority:'scoped DEVFULL workload; no human review impersonated'}));
 keys.clear();
} catch(error) {
 // Database driver errors can include connection details; retain only a bounded
 // known-safe error code/name. The caller receives a failing exit status.
 console.error(JSON.stringify({status:'failed',code:error instanceof Error && /^[A-Z_]+$/.test(error.message)?error.message:error instanceof Error?error.name:'UNKNOWN'}));process.exitCode=1;
} finally {store?.close?.();}
