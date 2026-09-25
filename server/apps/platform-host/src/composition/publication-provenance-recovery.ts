import { createHash } from "node:crypto";
import { canonicalBytes, sha256 } from "@athyper/server-adapter-publication-signing";
import { parseEntityAuthorizationProfile, parseEntityAuthorizationRuntime } from "@athyper/server-contract-metadata";
import type { LoadedPublicationArtifact } from "@athyper/server-contract-publication";
import type { DevPublicationConfiguration } from "./dev-publication.js";

const hash = (value: unknown) => sha256(canonicalBytes(value));
function requireRecovery(value: unknown, code: string): asserts value {
  if (!value) throw Error(code);
}
export interface PublicationRecoveryArchive {
  id: string; tenant_id: string; source_release_id: string; entity_code: string;
  artifact_hash: string; backup_hash: string; imported_at: string | Date;
  expires_at: string | Date; revoked: boolean; payload: any;
}

/** A short-lived operator recovery permit for ONE previously signed artifact.
 * Does not qualify new authoring, fabricate historical audit events, or renew the
 * old approval. The normal artifact loader and runtime registry still run first.
 */
export function validatePublicationRecovery(input: {
  archive: PublicationRecoveryArchive;
  loaded: LoadedPublicationArtifact;
  config: DevPublicationConfiguration;
  catalogHash: string;
  signingKeyId: string;
  now?: number;
}) {
  const { archive: a, loaded, config } = input, p = a.payload;
  const now = input.now ?? Date.now(), start = new Date(a.imported_at).valueOf(), end = new Date(a.expires_at).valueOf();
  requireRecovery(!a.revoked && Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end && end-start <= 3_600_000, "PUBLICATION_RECOVERY_EXPIRED_OR_REVOKED");
  const { envelope, manifest } = loaded.document;
  requireRecovery(loaded.verification.signatureVerified && loaded.verification.manifestValid && loaded.verification.runtimeCompatible && envelope.artifactKind === "entity_runtime", "PUBLICATION_RECOVERY_UNVERIFIED_ARTIFACT");
  requireRecovery(p?.schema === "athyper.publication-recovery/1" && a.tenant_id === config.tenantId && p.tenantId === a.tenant_id && a.source_release_id === envelope.releaseId && p.releaseId === a.source_release_id && config.runtimeApproval?.releaseId === a.source_release_id && a.entity_code === config.entityCode && p.entityCode === a.entity_code && config.targets.includes(envelope.targetPlane) && p.plane === envelope.targetPlane, "PUBLICATION_RECOVERY_SCOPE_MISMATCH");
  requireRecovery(a.artifact_hash === loaded.computedArtifactHash && a.artifact_hash === hash(loaded.document) && p.artifactHash === a.artifact_hash && p.backupHash === a.backup_hash && /^[a-f0-9]{64}$/.test(a.backup_hash) && p.currentCatalogHash === input.catalogHash, "PUBLICATION_RECOVERY_CONTENT_CHANGED");
  requireRecovery(manifest.signingKeyId === input.signingKeyId && manifest.signatureAlgorithm === "Ed25519" && manifest.evidence?.authorizationReviewMode === "development_auto_approval", "PUBLICATION_RECOVERY_SIGNING_SCOPE_INVALID");
  requireRecovery(p.authorId === config.author.principalId && p.publisherId === config.publisher.principalId && p.authorId !== p.publisherId && p.authorEpoch === config.author.authEpoch && p.publisherEpoch === config.publisher.authEpoch, "PUBLICATION_RECOVERY_WORKLOAD_CHANGED");
  requireRecovery(typeof p.historicalQualification === "string" && createHash("sha256").update(p.historicalQualification).digest("hex") === config.runtimeApproval.sha256, "PUBLICATION_RECOVERY_ORIGINAL_EVIDENCE_CHANGED");
  const q = JSON.parse(p.historicalQualification), source = p.provenance;
  const contract = envelope.payload.entityContract, descriptor = envelope.payload.entityDescriptor;
  const profile = parseEntityAuthorizationProfile(descriptor.descriptor.authorization);
  const runtime = parseEntityAuthorizationRuntime(descriptor.descriptor.authorizationRuntime, profile);
  requireRecovery(q.kind === "devfull_runtime_qualification" && q.signingKeyId === input.signingKeyId && q.coordinate.releaseId === envelope.releaseId && q.coordinate.tenantId === config.tenantId && q.coordinate.entityCode === config.entityCode && q.coordinate.plane === envelope.targetPlane && q.coordinate.releaseNo === envelope.releaseNo && q.coordinate.contractHash === hash(contract.contract) && q.coordinate.profileHash === hash(profile) && q.coordinate.runtimeHash === hash(runtime), "PUBLICATION_RECOVERY_ORIGINAL_COORDINATE_CHANGED");
  // Authoring signs CompiledMetaEntityArtifact; the authorization compiler signs
  // only the contract. Comparing those signatures would compare different bytes.
  // Bind the archived revision's actual content to the verified published contract.
  requireRecovery(source?.snapshot?.id === source?.release?.revision_id && source?.snapshot?.tenant_id === a.tenant_id && source?.snapshot?.entity_id === contract.entityId && source?.release?.entity_id === contract.entityId && source?.snapshot?.contract_hash === source?.release?.contract_hash && source?.snapshot?.contract_json != null && hash(source.snapshot.contract_json) === hash(contract.contract), "PUBLICATION_RECOVERY_SOURCE_CONTRACT_CHANGED");
  requireRecovery(source?.release?.id === envelope.releaseId && source.release.tenant_id === a.tenant_id && source.release.signing_key_id === contract.signature.keyId && source.release.signature_algorithm === contract.signature.algorithm && source.release.published_by === p.publisherId && source.changeSet?.id === source.release.change_set_id && source.changeSet.tenant_id === a.tenant_id && source.changeSet.status === "published" && source.changeSet.created_by === p.authorId && source.changeSet.submitted_by === p.authorId && source.changeSet.approved_by === p.publisherId && /^dev-publication-[a-f0-9]{24}$/.test(source.changeSet.branch_code), "PUBLICATION_RECOVERY_PROVENANCE_INVALID");
  for (const [name, code] of [["approval", "metadata.development_publication.approved"], ["dispatch", "metadata.development_publication.dispatched"]] as const) {
    const event = source[name];
    requireRecovery(event?.tenant_id === a.tenant_id && event.event_code === code && event.actor_type === "service_account" && event.actor_principal_id === p.publisherId && event.outcome === "success" && event.context?.mode === "development_auto_approval", "PUBLICATION_RECOVERY_AUDIT_INVALID");
  }
  requireRecovery(source.approval.context.changeSetId === source.changeSet.id && source.approval.context.authorId === p.authorId && source.approval.context.publisherId === p.publisherId && source.dispatch.context.release?.id === envelope.releaseId && source.dispatch.context.request?.scope?.tenantId === a.tenant_id && source.dispatch.context.request?.entityCode === a.entity_code && source.dispatch.context.request?.targets?.includes(envelope.targetPlane), "PUBLICATION_RECOVERY_AUDIT_COORDINATE_CHANGED");
  const receiptSha256 = hash({ mode: "development_auto_approval", coordinate: q.coordinate, qualificationSha256: config.runtimeApproval.sha256, authorId: p.authorId, authorEpoch: p.authorEpoch, publisherId: p.publisherId, publisherEpoch: p.publisherEpoch, approvalAuditId: source.approval.id, dispatchAuditId: source.dispatch.id });
  requireRecovery(receiptSha256 === manifest.evidence?.authorizationReviewReceiptSha256, "PUBLICATION_RECOVERY_ORIGINAL_RECEIPT_CHANGED");
  return { receiptSha256, mode: "operator_backup_recovery" as const, recoveryId: a.id, artifactHash: a.artifact_hash };
}
