import { sql, type Kysely } from "kysely";
import type {
  SignedMetaEntityArtifact,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { compileGraph, sha256 } from "./deterministic.js";

/** Materialize only an independently approved, signed native case-summary release.
 * Replays use the same immutable release; this creates no review or activation. */
export async function prepareDocumentCollectionRelease(
  db: Kysely<Record<string, never>>,
  input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly string[];
  },
) {
  if (!input.artifact.descriptor.collectionRelationship) return false;
  const rows = (
    await sql<
      Record<string, unknown>
    >`SELECT r.*,e.entity_code,c.approved_by,c.created_by author_id,c.submitted_by,s.contract_json
 FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id=r.tenant_id
 JOIN metadata.entity_change_set c ON c.id=r.change_set_id AND c.tenant_id=r.tenant_id
 JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.tenant_id=r.tenant_id
 WHERE r.id=${input.releaseId}::uuid AND r.tenant_id=shared.current_tenant_id() AND r.published_by=master.current_principal_id_soft()
 AND c.status IN ('approved','published') AND c.approved_by IS NOT NULL AND c.approved_by<>c.created_by AND c.approved_by<>c.submitted_by`.execute(
      db,
    )
  ).rows;
  const r = rows[0];
  if (
    rows.length !== 1 ||
    !r ||
    r.entity_code !== "business_partner_request" ||
    r.release_kind !== "publish" ||
    input.targetPlanes.join(",") !== "neon"
  )
    throw Error("DOCUMENT_COLLECTION_REVIEW_REQUIRED");
  const compiled = compileGraph(r.contract_json as MetaEntityGraph);
  if (
    compiled.contractHash !== input.artifact.contractHash ||
    compiled.descriptorHash !== input.artifact.descriptorHash ||
    sha256(compiled.descriptor) !== sha256(input.artifact.descriptor) ||
    r.contract_signature !== input.artifact.signature ||
    r.signing_key_id !== input.artifact.signingKeyId ||
    r.signature_algorithm !== input.artifact.signatureAlgorithm
  )
    throw Error("DOCUMENT_COLLECTION_SIGNED_SOURCE_MISMATCH");
  await sql`SELECT publication.fn_prepare_document_collection_release(${input.releaseId}::uuid,${JSON.stringify(compiled.descriptor)}::jsonb)`.execute(
    db,
  );
  return true;
}
