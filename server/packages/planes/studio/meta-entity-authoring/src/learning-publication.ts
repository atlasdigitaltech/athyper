import { sql, type Kysely } from "kysely";
import type { SignedMetaEntityArtifact } from "@athyper/server-contract-meta-entity-authoring";
import type { AtlasLearningHandoff } from "@athyper/server-contract-metadata";
import { sha256 } from "./deterministic.js";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";

/** Materialize a vocabulary-only derivative inside the ordinary release transaction.
 * Native storage, operations, authorization and owners are preserved byte-for-byte.
 * The existing publication worker signs, delivers and activates this artifact.
 */
export async function prepareAtlasLearningRelease(database: Kysely<Record<string, never>>, input: {releaseId: string; artifact: SignedMetaEntityArtifact; targetPlanes: readonly string[]}) {
  const ai = input.artifact.descriptor.ai as {vocabulary?: unknown} | undefined;
  if (!ai?.vocabulary) return;
  const source = (await sql<{tenant_id: string; entity_id: string; revision_id: string; release_hash: string; contract_hash: string; release_no: number; published_by: string; entity_code: string; proposal: AtlasLearningHandoff; evaluated_hash: string; compiled_json: Record<string, unknown>; base_compiled_hash: string; plane_key: string; publication_key: string | null}>`SELECT r.tenant_id,r.entity_id,r.revision_id,r.release_hash,r.contract_hash,r.release_no,r.published_by,e.entity_code,
      inbox.proposal,inbox.evaluated_hash,base.compiled_json,base.compiled_hash AS base_compiled_hash,base.plane_key,pr.release_key AS publication_key
    FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id=r.tenant_id
    JOIN ai.atlas_learning_inbox inbox ON inbox.change_set_id=r.change_set_id AND inbox.tenant_id=r.tenant_id AND inbox.state='drafted' AND inbox.expires_at>now()
    JOIN snapshot.entity_release_artifact base ON base.source_release_id=r.supersedes_release_id AND base.tenant_id=r.tenant_id
      AND base.plane_key=inbox.origin_plane
    LEFT JOIN publication.entity_release_link link ON link.entity_release_id=base.source_release_id
    LEFT JOIN publication.release pr ON pr.id=link.publication_release_id AND pr.tenant_id=r.tenant_id
    WHERE r.id=${input.releaseId}::uuid AND pr.id::text=inbox.proposal->>'sourceReleaseId'`.execute(database)).rows;
  if (source.length !== 1) throw new AuthoringPolicyError("LEARNING_BASE_RELEASE_REQUIRED", "Learning publication needs the exact preceding tenant runtime artifact");
  const row = source[0]!;
  if (!([row.base_compiled_hash,sha256(row.compiled_json)].includes(row.proposal.sourceDescriptorHash)) || row.evaluated_hash !== input.artifact.descriptorHash || input.targetPlanes.length !== 1 || input.targetPlanes[0] !== row.plane_key || row.compiled_json.schema !== "athyper.entity-runtime-descriptor/1.0" || row.compiled_json.entityCode !== row.entity_code || row.compiled_json.planeKey !== row.plane_key) throw new AuthoringPolicyError("LEARNING_TARGET_MISMATCH", "Publish the reviewed correction to its originating entity and plane");
  const descriptor = {...row.compiled_json, ai};
  await sql`INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
    VALUES(${row.tenant_id}::uuid,${input.releaseId}::uuid,${row.revision_id}::uuid,${row.entity_id}::uuid,${row.plane_key},${row.release_hash},${row.contract_hash},${JSON.stringify(descriptor)}::jsonb,
      snapshot.fn_compute_entity_release_artifact_hash(${input.releaseId}::uuid,${row.revision_id}::uuid,${row.entity_id}::uuid,${row.plane_key},${row.release_hash},${row.contract_hash},${JSON.stringify(descriptor)}::jsonb),
      ${JSON.stringify({schema: "atlas-learning-compilation/1", proposalHash: row.proposal.proposalHash, evaluatedHash: row.evaluated_hash})}::jsonb,${row.published_by}::uuid)`.execute(database);
  await sql`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
    VALUES(${input.releaseId}::uuid,${row.tenant_id}::uuid,${row.publication_key ?? `metadata.entity.${row.entity_code}`},${row.release_no},'publish','preparing','backward_compatible',${row.release_hash},${row.release_hash},${row.published_by}::uuid,${JSON.stringify({schema: "atlas-learning-publication/1", candidateId: row.proposal.candidateId, proposalHash: row.proposal.proposalHash})}::jsonb)`.execute(database);
  await sql`INSERT INTO publication.entity_release_link(publication_release_id,entity_release_id) VALUES(${input.releaseId}::uuid,${input.releaseId}::uuid)`.execute(database);
  await sql`SELECT publication.fn_transition_release(${input.releaseId}::uuid,'approved',${row.published_by}::uuid,NULL::uuid,${JSON.stringify({review: "meta-entity-change-set", evaluatedHash: row.evaluated_hash})}::jsonb)`.execute(database);
}
