import { digest, assertCurrent } from './atlas-baseline-adoption-model.mjs';
export { assertCurrent };
const requireValue = (condition, message) => { if (!condition) throw Error(message); };
export function planMeshBaseline(source, expected) {
  const {contract:c,descriptor:d,head:h,applied:a}=source;
  requireValue(c&&d&&h&&a,'MESH_BASELINE_INCOMPLETE');
  requireValue(/^[a-f0-9-]{36}$/.test(expected.tenantId),'MESH_TARGET_TENANT_REQUIRED');
  requireValue(c.tenant_id===null&&d.tenant_id===null,'MESH_SOURCE_NOT_GLOBAL');
  requireValue(c.entity_code==='network_relationship'&&d.plane_code==='mesh'&&d.descriptor_kind==='entity_runtime','MESH_ENTITY_MISMATCH');
  requireValue(c.publication_key===expected.publicationKey&&h.publication_key===c.publication_key&&a.publication_key===c.publication_key,'MESH_KEY_MISMATCH');
  requireValue(c.status==='published'&&d.status==='active'&&a.status==='active','MESH_SOURCE_NOT_ACTIVE');
  requireValue(c.release_id===expected.releaseId&&Number(c.release_no)===expected.releaseNo&&d.compiled_hash===expected.compiledHash,'MESH_BASELINE_STALE');
  requireValue(d.entity_contract_id===c.id&&d.entity_id===c.entity_id&&d.release_id===c.release_id&&d.revision_id===c.revision_id&&d.source_contract_hash===c.entity_contract_hash,'MESH_DESCRIPTOR_MISMATCH');
  requireValue(h.applied_release_id===a.id&&d.applied_release_id===a.id&&a.source_release_id===c.release_id&&Number(h.source_release_no)===Number(c.release_no)&&Number(a.source_release_no)===Number(c.release_no)&&h.artifact_hash===a.artifact_hash,'MESH_HEAD_MISMATCH');
  requireValue(d.compiled_json?.entityCode===c.entity_code&&d.compiled_json?.planeKey==='mesh'&&c.contract_json?.entity?.entityCode===c.entity_code,'MESH_PAYLOAD_MISMATCH');
  for(const hash of [d.compiled_hash,c.entity_contract_hash,h.artifact_hash])requireValue(/^[a-f0-9]{64}$/.test(hash),'MESH_HASH_INVALID');
  return {
    schema:'athyper.imported-global-entity-baseline/1',tenantId:expected.tenantId,
    sourceTenantId:null,sourcePlane:'mesh',entityCode:c.entity_code,sourceEntityId:c.entity_id,
    publicationKey:c.publication_key,sourceReleaseId:c.release_id,sourceReleaseNo:Number(c.release_no),
    sourceContractHash:c.entity_contract_hash,sourceCompiledHash:d.compiled_hash,sourceArtifactHash:h.artifact_hash,
    contentHash:digest(source),source:structuredClone(source),
    provenance:{kind:'observed_global_runtime_import',environment:'dev',sourceDatabase:'athyper_mesh',
      sourceTables:['runtime_meta.entity_contract','runtime_meta.entity_descriptor','runtime_meta.release_activation_head','runtime_meta.applied_release'],
      historicalStudioApproval:'not_available',historicalStudioSignature:'not_available',
      sourceSignatureAlgorithm:c.signature_algorithm,sourceSigningKeyId:c.signing_key_id,sourceSignatureVerification:'not_performed_by_importer'},
  };
}
