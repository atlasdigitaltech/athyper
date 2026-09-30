import { createHash } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

/** Source hashes are retained as evidence, never relabelled as our content digest
 * or as verified Studio signatures. The import digest binds the complete capture.
 */
export function planAdoption(source, expected) {
  const { contract: c, descriptor: d, head: h, applied: a } = source;
  requireValue(c && d && h && a, 'BASELINE_CAPTURE_INCOMPLETE');
  requireValue(expected.tenantId && c.tenant_id === expected.tenantId && d.tenant_id === expected.tenantId, 'BASELINE_TENANT_MISMATCH');
  requireValue(c.entity_code === expected.entityCode && d.plane_code === 'neon' && d.descriptor_kind === 'entity_runtime', 'BASELINE_ENTITY_MISMATCH');
  requireValue(c.publication_key === expected.publicationKey && h.publication_key === c.publication_key && a.publication_key === c.publication_key, 'BASELINE_KEY_MISMATCH');
  requireValue(c.status === 'published' && d.status === 'active' && a.status === 'active', 'BASELINE_NOT_ACTIVE');
  requireValue(c.release_id === expected.releaseId && Number(c.release_no) === expected.releaseNo && d.compiled_hash === expected.compiledHash, 'BASELINE_STALE');
  requireValue(d.entity_contract_id === c.id && d.entity_id === c.entity_id && d.release_id === c.release_id && d.revision_id === c.revision_id && d.source_contract_hash === c.entity_contract_hash, 'BASELINE_DESCRIPTOR_MISMATCH');
  requireValue(h.applied_release_id === a.id && d.applied_release_id === a.id && a.source_release_id === c.release_id && Number(h.source_release_no) === Number(c.release_no) && Number(a.source_release_no) === Number(c.release_no) && h.artifact_hash === a.artifact_hash, 'BASELINE_HEAD_MISMATCH');
  requireValue(Number.isSafeInteger(Number(c.release_no)) && Number(c.release_no) > 0 && Number(c.release_no) < Number.MAX_SAFE_INTEGER, 'BASELINE_RELEASE_NUMBER_INVALID');
  requireValue(d.compiled_json?.entityCode === c.entity_code && d.compiled_json?.planeKey === 'neon' && c.contract_json?.entity?.entityCode === c.entity_code, 'BASELINE_PAYLOAD_MISMATCH');
  for (const hash of [d.compiled_hash, c.entity_contract_hash, h.artifact_hash]) requireValue(/^[a-f0-9]{64}$/.test(hash), 'BASELINE_HASH_INVALID');
  return {
    schema: 'athyper.imported-entity-baseline/1', tenantId: c.tenant_id,
    entityCode: c.entity_code, sourceEntityId: c.entity_id, sourcePlane: 'neon',
    publicationKey: c.publication_key, sourceReleaseId: c.release_id,
    sourceReleaseNo: Number(c.release_no), sourceContractHash: c.entity_contract_hash,
    sourceCompiledHash: d.compiled_hash, sourceArtifactHash: h.artifact_hash,
    contentHash: digest(source), source,
    provenance: { kind: 'observed_runtime_import', environment: 'dev',
      sourceDatabase: 'athyper_neon', sourceTables: ['runtime_meta.entity_contract', 'runtime_meta.entity_descriptor', 'runtime_meta.release_activation_head', 'runtime_meta.applied_release'],
      historicalStudioApproval: 'not_available', historicalStudioSignature: 'not_available',
      sourceSignatureAlgorithm: c.signature_algorithm, sourceSigningKeyId: c.signing_key_id,
      sourceSignatureVerification: 'not_performed_by_importer' },
  };
}

export function assertCurrent(imported, current) {
  requireValue(digest(current) === imported.contentHash, 'BASELINE_STALE');
}

/** A candidate is not a release, approval or executable publication request. */
export function planInitialAi(imported, ai) {
  requireValue(digest(imported.source) === imported.contentHash, 'BASELINE_CONTENT_CHANGED');
  const descriptor = imported.source.descriptor.compiled_json;
  requireValue(!descriptor.ai?.enabled, 'INITIAL_AI_ALREADY_ENABLED');
  requireValue(ai?.enabled === true && ai.schemaVersion === 1 && descriptor.operations?.read, 'INITIAL_AI_READ_REQUIRED');
  const candidate = { ...structuredClone(descriptor), ai: structuredClone(ai) };
  return { schema: 'athyper.initial-ai-publication-plan/1', tenantId: imported.tenantId,
    entityCode: imported.entityCode, sourceEntityId: imported.sourceEntityId,
    publicationKey: imported.publicationKey, targetPlane: imported.sourcePlane,
    expectedBaselineHash: imported.contentHash, expectedSourceReleaseId: imported.sourceReleaseId,
    expectedSourceReleaseNo: imported.sourceReleaseNo, proposedReleaseNo: imported.sourceReleaseNo + 1,
    contract: structuredClone(imported.source.contract.contract_json), descriptor: candidate,
    descriptorContentHash: digest(candidate), changedDescriptorKeys: ['ai'],
    approval: 'required', signature: 'required', activation: 'not_requested',
    rollback: { strategy: 'reviewed_forward_release', contract: structuredClone(imported.source.contract.contract_json), descriptor: structuredClone(descriptor) },
  };
}
