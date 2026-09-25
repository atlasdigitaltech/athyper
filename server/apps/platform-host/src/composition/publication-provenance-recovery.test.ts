import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {canonicalBytes,sha256} from '@athyper/server-adapter-publication-signing';
import {validatePublicationRecovery} from './publication-provenance-recovery.js';
const hash=(v:unknown)=>sha256(canonicalBytes(v));
function fixture(): any {
 const tenant='11111111-1111-4111-8111-111111111111',release='22222222-2222-4222-8222-222222222222';
 const profile={schemaVersion:1,entityCode:'business_partner',planeKey:'neon',ownership:'tenant.record.v1',directory:{operation:'discover',population:'tenant'},recordReadOperation:'read',operations:['discover','read'].map(key=>({key,permissionCode:'neon.relationship.business_partner.read',scope:'tenant.record.v1',target:key==='discover'?'collection':'existing',effect:'read',requiresParentRead:false,requiresPreflight:false})),fieldPolicies:[],surfaces:[],relationships:[]};
 const runtime={schemaVersion:1,runtimeVersion:'entity-authorization.v1',bindings:profile.operations.map(o=>({operation:o.key,handler:'bp.directory.v1',resolver:o.scope}))};
 const coordinate={releaseId:release,releaseNo:1,tenantId:tenant,plane:'neon',entityCode:'business_partner',contractHash:hash({}),profileHash:hash(profile),runtimeHash:hash(runtime),catalogHash:'historical',operationKeys:['discover','read']};
 const historicalQualification=JSON.stringify({kind:'devfull_runtime_qualification',signingKeyId:'key',coordinate,expiresAt:'2020-01-01T00:00:00Z'});
 const qualificationSha256=createHash('sha256').update(historicalQualification).digest('hex');
 const receipt=hash({mode:'development_auto_approval',coordinate,qualificationSha256,authorId:'author',authorEpoch:0,publisherId:'publisher',publisherEpoch:0,approvalAuditId:'approval',dispatchAuditId:'dispatch'});
 const document={envelope:{artifactKind:'entity_runtime',releaseId:release,releaseNo:1,targetPlane:'neon',payload:{entityContract:{contract:{},signature:{signature:'original'}},entityDescriptor:{descriptor:{authorization:profile,authorizationRuntime:runtime}}}},manifest:{signingKeyId:'key',signatureAlgorithm:'Ed25519',evidence:{authorizationReviewMode:'development_auto_approval',authorizationReviewReceiptSha256:receipt}}};
 const event=(id:string,context:any)=>({id,tenant_id:tenant,event_code:`metadata.development_publication.${id==='approval'?'approved':'dispatched'}`,actor_type:'service_account',actor_principal_id:'publisher',outcome:'success',context:{...context,mode:'development_auto_approval'}});
 Object.assign(document.envelope.payload.entityContract, {entityId:"entity"});
 Object.assign(document.envelope.payload.entityContract.signature, {keyId:"key",algorithm:"Ed25519"});
 const artifactHash=hash(document),now=Date.now();
 const result: any = {now,signingKeyId:'key',catalogHash:'current',config:{tenantId:tenant,entityCode:'business_partner',targets:['neon'],runtimeApproval:{releaseId:release,sha256:qualificationSha256},author:{principalId:'author',authEpoch:0},publisher:{principalId:'publisher',authEpoch:0}},loaded:{document,computedArtifactHash:artifactHash,verification:{signatureVerified:true,manifestValid:true,runtimeCompatible:true}},archive:{id:'archive',tenant_id:tenant,source_release_id:release,entity_code:'business_partner',artifact_hash:artifactHash,backup_hash:'b'.repeat(64),imported_at:new Date(now-1000),expires_at:new Date(now+60000),revoked:false,payload:{schema:'athyper.publication-recovery/1',tenantId:tenant,releaseId:release,entityCode:'business_partner',plane:'neon',artifactHash,backupHash:'b'.repeat(64),authorId:'author',authorEpoch:0,publisherId:'publisher',publisherEpoch:0,currentCatalogHash:'current',historicalQualification,provenance:{release:{id:release,tenant_id:tenant,contract_signature:'original',published_by:'publisher',change_set_id:'change'},changeSet:{id:'change',tenant_id:tenant,status:'published',created_by:'author',submitted_by:'author',approved_by:'publisher',branch_code:'dev-publication-'+ 'a'.repeat(24)},approval:event('approval',{changeSetId:'change',authorId:'author',publisherId:'publisher'}),dispatch:event('dispatch',{release:{id:release},request:{scope:{tenantId:tenant},entityCode:'business_partner',targets:['neon']}})}}}};
 Object.assign(result.archive.payload.provenance.release,{entity_id:"entity",revision_id:"revision",contract_hash:"native-hash",signing_key_id:"key",signature_algorithm:"Ed25519",contract_signature:"full-artifact-signature"});
 result.archive.payload.provenance.snapshot={id:"revision",tenant_id:tenant,entity_id:"entity",contract_hash:"native-hash",contract_json:{}};
 return result;
}
describe('exact-artifact recovery permits',()=>{
 it('uses a fresh recovery permit without renewing or impersonating historical approval',()=>{expect(validatePublicationRecovery(fixture()).mode).toBe('operator_backup_recovery');});
 const changes: [string,(v:any)=>void][]=[
  ['snapshot content',v=>v.archive.payload.provenance.snapshot.contract_json={changed:true}],
  ['snapshot revision',v=>v.archive.payload.provenance.snapshot.id='other'],
  ['snapshot tenant',v=>v.archive.payload.provenance.snapshot.tenant_id='other'],
  ['snapshot entity',v=>v.archive.payload.provenance.snapshot.entity_id='other'],
  ['native key',v=>v.archive.payload.provenance.release.signing_key_id='other'],
  ['expired',v=>v.archive.expires_at=new Date(v.now-1)],['future',v=>v.archive.imported_at=new Date(v.now+1)],['revoked',v=>v.archive.revoked=true],['oversized validity',v=>v.archive.expires_at=new Date(v.now+7200000)],
  ['tenant',v=>v.archive.tenant_id='other'],['release',v=>v.archive.source_release_id='other'],['entity',v=>v.archive.entity_code='other'],['plane',v=>v.archive.payload.plane='mesh'],
  ['signature',v=>v.loaded.verification.signatureVerified=false],['runtime',v=>v.loaded.verification.runtimeCompatible=false],['content',v=>v.loaded.document.envelope.releaseNo=2],['catalog',v=>v.catalogHash='changed'],
  ['revoked workload epoch',v=>v.config.publisher.authEpoch++],['self approval',v=>v.archive.payload.authorId='publisher'],['key',v=>v.signingKeyId='rotated'],['historical evidence',v=>v.archive.payload.historicalQualification+=' '],
  ['audit ID',v=>v.archive.payload.provenance.approval.id='forged'],['audit actor',v=>v.archive.payload.provenance.dispatch.actor_type='user'],['audit scope',v=>v.archive.payload.provenance.dispatch.context.request.scope.tenantId='other'],['draft',v=>v.archive.payload.provenance.changeSet.status='draft'],
 ];
 it.each(changes)('rejects %s changes',(_name,change)=>{const v=fixture();change(v);expect(()=>validatePublicationRecovery(v)).toThrow();});
});
