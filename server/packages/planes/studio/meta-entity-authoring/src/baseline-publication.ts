import {sql, type Kysely} from 'kysely';
import {AuthoringPolicyError, type SignedMetaEntityArtifact} from '@athyper/server-contract-meta-entity-authoring';
import {parseEntityAiDescriptor} from '@athyper/server-contract-metadata';
import {createHash} from 'node:crypto';

/** Runtime payload hashes preserve array order; graph hashes sort selected branches. */
export function baselineJsonHash(value:unknown):string {
  const encode=(item:unknown):string=>Array.isArray(item)?'['+item.map(encode).join(',')+']':item&&typeof item==='object'?'{'+Object.keys(item).sort().map(key=>JSON.stringify(key)+':'+encode((item as Record<string,unknown>)[key])).join(',')+'}':JSON.stringify(item);
  return createHash('sha256').update(encode(value)).digest('hex');
}

type Json = Record<string, unknown>;
export interface ImportedEntityBaseline {
  schema: string; tenantId: string; entityCode: string; sourceEntityId: string;
  sourcePlane: string; publicationKey: string; sourceReleaseId: string;
  sourceReleaseNo: number; contentHash: string;
  source: {contract: {contract_json: Json}; descriptor: {compiled_json: Json}; head: Json; applied: Json};
}
interface BaselineMarker {id: string; contentHash: string; descriptorHash: string; sourceEntityId: string}
export function baselinePublicationCoordinate(baseline: ImportedEntityBaseline) {
  const fork=baseline.schema==='athyper.imported-global-entity-baseline/1';
  return {publicationKey:fork?`${baseline.publicationKey}.tenant.${baseline.tenantId}`:baseline.publicationKey,releaseNo:fork?1:baseline.sourceReleaseNo+1};
}
function denied(code: string): never {throw new AuthoringPolicyError(code, 'Imported baseline publication is unavailable or its reviewed source changed');}

export function compileInitialBaselineDescriptor(baseline: ImportedEntityBaseline, proposedAi: unknown): Json {
  if(!((baseline.schema === 'athyper.imported-entity-baseline/1' && baseline.sourcePlane === 'neon') || (baseline.schema === 'athyper.imported-global-entity-baseline/1' && baseline.sourcePlane === 'mesh')) || baselineJsonHash(baseline.source)!==baseline.contentHash) denied('BASELINE_CONTENT_MISMATCH');
  const source=baseline.source.descriptor.compiled_json;
  if(source.entityCode!==baseline.entityCode || source.planeKey!==baseline.sourcePlane || source.schema!=='athyper.entity-runtime-descriptor/1.0') denied('BASELINE_IDENTITY_MISMATCH');
  if((source.ai as {enabled?:boolean}|undefined)?.enabled) denied('BASELINE_INITIAL_ENABLEMENT_ONLY');
  const operations=source.operations as Json;
  if(!operations?.read || !Array.isArray(source.fields)) denied('BASELINE_READ_REQUIRED');
  const fields=source.fields as {key:string;searchable?:boolean;reference?:boolean}[];
  const ai=parseEntityAiDescriptor(proposedAi,{entityCode:baseline.entityCode,planeKey:baseline.sourcePlane as 'neon'|'mesh',fields,operationKeys:Object.keys(operations)});
  if(!ai.enabled) denied('BASELINE_AI_ENABLEMENT_REQUIRED');
  return {...source,ai};
}

/** An explicit bridge: native authoring sequence and imported runtime sequence
 * remain separate. No metadata.entity_release is inserted for the old baseline.
 * Called inside the ordinary approved release transaction, never as an importer.
 */
export async function prepareInitialBaselineRelease(database: Kysely<Record<string,never>>,
  input: {releaseId:string;artifact:SignedMetaEntityArtifact;targetPlanes:readonly string[]},
  sourceCurrent: (baseline: ImportedEntityBaseline, actorId:string)=>Promise<boolean>):Promise<boolean> {
  const surfaces=input.artifact.descriptor.surfaces;
  const markers=Array.isArray(surfaces)?surfaces.flatMap(surface=>{
    const marker=(surface as {layoutConfig?:{baselineImport?:BaselineMarker}}).layoutConfig?.baselineImport;
    return marker?[marker]:[];
  }):[];
  if(!markers.length)return false;
  if(markers.length!==1 || input.targetPlanes.length!==1 || !['neon','mesh'].includes(input.targetPlanes[0]!))denied('BASELINE_TARGET_MISMATCH');
  const marker=markers[0]!;
  if(!/^[0-9a-f-]{36}$/.test(marker.id))denied('BASELINE_REFERENCE_INVALID');
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${marker.id},0))`.execute(database);
  const row=(await sql<{tenant_id:string;entity_id:string;entity_code:string;revision_id:string;release_hash:string;contract_hash:string;published_by:string;approved_by:string;payload:ImportedEntityBaseline}>`
    SELECT r.tenant_id,r.entity_id,e.entity_code,r.revision_id,r.release_hash,r.contract_hash,r.published_by,cs.approved_by,b.payload
    FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id=r.tenant_id
    JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.tenant_id=r.tenant_id
    JOIN metadata.entity_baseline_import b ON b.id=${marker.id}::uuid AND b.tenant_id=r.tenant_id AND b.entity_code=e.entity_code
    WHERE r.id=${input.releaseId}::uuid AND r.release_kind='publish' AND cs.approved_by IS NOT NULL
      AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
      AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation revoked WHERE revoked.baseline_id=b.id)
    `.execute(database)).rows[0];
  if(!row)denied('BASELINE_APPROVED_SOURCE_REQUIRED');
  const baseline=row.payload;
  if(input.targetPlanes[0]!==baseline.sourcePlane)denied('BASELINE_TARGET_MISMATCH');
  const target=baselinePublicationCoordinate(baseline);
  if(baseline.contentHash!==marker.contentHash || baseline.sourceEntityId!==marker.sourceEntityId || baseline.tenantId!==row.tenant_id)denied('BASELINE_REVIEW_MISMATCH');
  const descriptor=compileInitialBaselineDescriptor(baseline,input.artifact.descriptor.ai);
  if(baselineJsonHash(descriptor)!==marker.descriptorHash)denied('BASELINE_REVIEW_MISMATCH');
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${target.publicationKey},0))`.execute(database);
  if(!await sourceCurrent(baseline,row.published_by))denied('BASELINE_STALE');
  const existing=(await sql`SELECT id FROM publication.release WHERE release_key=${target.publicationKey} AND release_no>=${target.releaseNo} LIMIT 1`.execute(database)).rows;
  if(existing.length)denied('BASELINE_SUCCESSOR_EXISTS');
  // The API has no direct snapshot-write privilege. The publication-owned
  // materializer rechecks tenant, publisher, independent approval and exact delta.
  await sql`SELECT publication.fn_prepare_initial_baseline_release(${input.releaseId}::uuid,${marker.id}::uuid,${JSON.stringify(descriptor)}::jsonb)`.execute(database);
  return true;
}
