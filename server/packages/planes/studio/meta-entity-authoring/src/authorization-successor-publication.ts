import {sql,type Kysely} from 'kysely';
import {AuthoringPolicyError,type SignedMetaEntityArtifact} from '@athyper/server-contract-meta-entity-authoring';
import {compileAuthorizationSuccessorDescriptor} from './authorization-successor.js';
import {baselineJsonHash} from './baseline-publication.js';
type Json=Record<string,any>;
export interface SuccessorSource {tenantId:string;actorId:string;publicationKey:string;releaseId:string;releaseNo:number;descriptorHash:string}
export interface SuccessorHead {sourceReleaseId:string;sourceReleaseNo:number;appliedReleaseId:string;rowVersion:number;artifactHash:string;descriptorHash:string}
/** Runs inside native createRelease's transaction. No publication is dispatched
 * here. The runtime head becomes a signed activation precondition downstream. */
export async function prepareAuthorizationSuccessorRelease(database:Kysely<Record<string,never>>,input:{releaseId:string;artifact:SignedMetaEntityArtifact;targetPlanes:readonly string[]},currentHead:(source:SuccessorSource)=>Promise<SuccessorHead|null>):Promise<boolean>{
 const surfaces=input.artifact.descriptor.surfaces;
 const carriers=Array.isArray(surfaces)?surfaces.filter((s:any)=>s.layoutConfig?.authorizationSuccessor):[];
 if(!carriers.length)return false;
 const deny=(code:string):never=>{throw new AuthoringPolicyError(code,'Combined successor publication prerequisites are not satisfied');};
 if(carriers.length!==1||input.targetPlanes.length!==1||input.targetPlanes[0]!=='neon')deny('SUCCESSOR_TARGET_MISMATCH');
 const marker=(carriers[0] as any).layoutConfig.authorizationSuccessor;
 await sql`SELECT pg_advisory_xact_lock(hashtextextended(${marker.predecessor.publicationKey},0))`.execute(database);
 const row=(await sql<Json>`SELECT r.tenant_id,r.published_by,pr.id predecessor_id,pr.release_no,pr.release_key,
 a.compiled_json predecessor_descriptor,rev.contract_json predecessor_contract,p.descriptor
 FROM metadata.entity_release r JOIN publication.release pr ON pr.id=${marker.predecessor.releaseId}::uuid AND pr.tenant_id=r.tenant_id
 JOIN publication.entity_baseline_release_link l ON l.publication_release_id=pr.id AND l.tenant_id=pr.tenant_id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id=l.tenant_id AND er.entity_id=r.entity_id
 JOIN snapshot.entity_contract_revision rev ON rev.id=er.revision_id AND rev.tenant_id=er.tenant_id
 JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id AND a.plane_key='neon'
 JOIN publication.entity_authorization_successor_payload p ON p.content_hash=${marker.combinedDescriptorHash} AND p.tenant_id=r.tenant_id
 WHERE r.id=${input.releaseId}::uuid AND pr.status IN ('approved','published')
 AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation v WHERE v.baseline_id=l.baseline_id)`.execute(database)).rows;
 if(row.length!==1)deny('SUCCESSOR_SOURCE_UNAVAILABLE');
 const source=row[0]!;
 compileAuthorizationSuccessorDescriptor({nativeDescriptor:input.artifact.descriptor,predecessor:{releaseId:source.predecessor_id,releaseNo:Number(source.release_no),publicationKey:source.release_key,descriptor:source.predecessor_descriptor,authoredContract:source.predecessor_contract},proposedDescriptor:source.descriptor});
 const head=await currentHead({tenantId:source.tenant_id,actorId:source.published_by,publicationKey:source.release_key,releaseId:source.predecessor_id,releaseNo:Number(source.release_no),descriptorHash:baselineJsonHash(source.predecessor_descriptor)});
 if(!head||head.sourceReleaseId!==source.predecessor_id||head.sourceReleaseNo!==Number(source.release_no)||head.descriptorHash!==baselineJsonHash(source.predecessor_descriptor))deny('SUCCESSOR_RUNTIME_HEAD_CHANGED');
 await sql`SELECT publication.fn_prepare_authorization_successor(${input.releaseId}::uuid,${JSON.stringify(head)}::jsonb)`.execute(database);
 return true;
}
