import { sql, type Kysely } from "kysely";
import { collectionPublicationFromGraph } from "@athyper/server-contract-publication";
import {
  AuthoringPolicyError,
  type SignedMetaEntityArtifact,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { compileGraph, sha256 } from "./deterministic.js";
export async function prepareCollectionConfigurationRelease(
  db: Kysely<Record<string, never>>,
  input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly string[];
  },
): Promise<boolean> {
  if (!input.artifact.descriptor.collectionConfiguration) return false;
  const row = (
    await sql<
      Record<string, any>
    >`SELECT s.contract_json,r.contract_signature,r.signature_algorithm,r.signing_key_id FROM metadata.entity_release r JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.tenant_id=r.tenant_id WHERE r.id=${input.releaseId}::uuid AND r.tenant_id=shared.current_tenant_id() AND r.published_by=master.current_principal_id_soft()`.execute(
      db,
    )
  ).rows[0];
  if (!row)
    throw new AuthoringPolicyError(
      "COLLECTION_RELEASE_UNAVAILABLE",
      "Collection release unavailable",
    );
  const descriptor = collectionPublicationFromGraph(row.contract_json);
  if (!descriptor) throw new TypeError("Collection configuration missing");
  if (
    [...descriptor.configuration.targetPlanes].sort().join() !==
    [...input.targetPlanes].sort().join()
  )
    throw new TypeError(
      "Publication targets must match the collection target planes",
    );
  const compiled = compileGraph(row.contract_json as MetaEntityGraph);
  if (
    compiled.contractHash !== input.artifact.contractHash ||
    compiled.descriptorHash !== input.artifact.descriptorHash ||
    sha256(compiled.descriptor) !== sha256(input.artifact.descriptor) ||
    row.contract_signature !== input.artifact.signature ||
    row.signature_algorithm !== input.artifact.signatureAlgorithm ||
    row.signing_key_id !== input.artifact.signingKeyId
  )
    throw new AuthoringPolicyError(
      "COLLECTION_SIGNED_SOURCE_MISMATCH",
      "Collection source does not match its signed release",
    );
  await sql`SELECT publication.fn_prepare_collection_configuration_release(${input.releaseId}::uuid,${JSON.stringify(descriptor)}::jsonb)`.execute(
    db,
  );
  return true;
}
