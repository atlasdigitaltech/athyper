import{readFileSync}from'node:fs';import{loadConfig}from'/app/server/dist/config/index.js';import{createContainer}from'/app/server/dist/composition/create-container.js';import{registerAdapters}from'/app/server/dist/composition/register-adapters.js';import{registerPlatform}from'/app/server/dist/composition/register-platform.js';import{registerRuntimes}from'/app/server/dist/composition/register-runtimes.js';import{registerServices}from'/app/server/dist/composition/register-services.js';import{loadDeploymentEntityReleaseReview}from'/app/server/dist/composition/entity-release-review-deployment.js';import{createLifecycle}from'@athyper/server-foundation/lifecycle';
const config=loadConfig(),lifecycle=createLifecycle(),container=createContainer();registerAdapters(container,config,lifecycle);registerRuntimes(container,config,lifecycle);registerPlatform(container,config);
const review=loadDeploymentEntityReleaseReview('/bp-review-config.json',{neon:container.adapters.neonDatabase.database,studio:container.adapters.athyperDatabase.database});registerServices(container,{entityAuthorizationReleaseReview:review},config);

import {sql} from 'kysely';
import {VerifiedPublicationArtifactLoader} from '@athyper/server-service-publication';
import {canonicalBytes,sha256} from '@athyper/server-adapter-publication-signing';
const rows=await container.adapters.athyperDatabase.database.transaction().execute(async tx=>{
 await sql`SET TRANSACTION READ ONLY`.execute(tx);
 await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true)`.execute(tx);
 return (await sql`SELECT a.*,r.release_key,r.release_no FROM publication.artifact a JOIN publication.release r ON r.id=a.publication_release_id WHERE r.id='ba383d04-9a18-4e59-ab4e-3d9726e934c6' AND a.status='signed'`.execute(tx)).rows;
});
if(rows.length!==1)throw Error('Exactly one signed artifact required');
const a=rows[0],loader=new VerifiedPublicationArtifactLoader({store:container.adapters.publicationArtifactStore,verifier:container.adapters.publicationVerifier,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion,authorizationRuntime:container.services.bpAuthorizationCompilation.runtime});
const loaded=await loader.load({artifactUri:a.artifact_uri,artifactHash:a.content_hash,targetPlane:a.plane_code,publicationKey:a.release_key,sourceReleaseId:a.publication_release_id,sourceReleaseNo:Number(a.release_no),signatureAlgorithm:a.signature_algorithm,signingKeyId:a.signing_key_id,signature:a.signature});
const d=loaded.document.envelope.payload.entityDescriptor.descriptor;
const head=await container.adapters.neonDatabase.database.transaction().execute(async tx=>{await sql`SET TRANSACTION READ ONLY`.execute(tx);await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true)`.execute(tx);return (await sql`SELECT h.* FROM runtime_meta.release_activation_head h WHERE h.publication_key=${a.release_key}`.execute(tx)).rows;});
console.log(JSON.stringify({schemaVersion:1,kind:'bp_release_19_signed_artifact_verification',capturedAt:new Date().toISOString(),releaseId:a.publication_release_id,artifactId:a.id,artifactHash:a.content_hash,signedAt:a.signed_at,verification:loaded.verification,operationCount:d.authorization.operations.length,scopeBindingCount:d.operation_scope_bindings.length,qualificationScopes:d.operation_scope_bindings.filter(b=>b.operationKey==='qualification').map(b=>b.scopeKind),head,reviewReceipt:loaded.document.manifest.evidence.authorizationReviewReceiptSha256,grantsChanged:false,activationAuthorized:false,authenticatedBusinessJourneysQualified:false,policyDifferencesAccepted:false}));
process.exit(0);
