import { sql, type Kysely } from "kysely";
import {
  inspectHumanReviewedProduct,
  KyselyMetaEntityAuthoringRepository,
  compileNativePublication,
  type ProductReviewPorts,
  type ProductReviewReceipt,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { assertPublicationCompilerIdentity } from "./compiler-build.js";
import {
  parseHumanReviewedExecutionPolicy,
  type HumanReviewedExecutionPolicy,
} from "./human-publication-policy.js";
function requirePolicy(condition: unknown, code: string): asserts condition {
  if (!condition) throw Error(`HUMAN_PUBLICATION_POLICY_${code}`);
}

/** Enrollment admission under the existing control-role transaction. No grant,
 * lifecycle transition, synthetic review or release allocation occurs here. */
export async function assertHumanReviewedEnrollmentSource(
  database: Kysely<Record<string, never>>,
  input: HumanReviewedExecutionPolicy,
  tenantId: string,
  nativeSource?: (
    tx: Kysely<Record<string, never>>,
    id: string,
  ) => ReturnType<ProductReviewPorts["nativeSource"]>,
): Promise<void> {
  const policy = parseHumanReviewedExecutionPolicy(input);
  requirePolicy(
    database.isTransaction && tenantId === policy.authorityTenantId,
    "AUTHORITY_MISMATCH",
  );
  assertPublicationCompilerIdentity(policy.compiler);
  const repository = new KyselyMetaEntityAuthoringRepository(database);
  for (const member of [...policy.plan.members].sort((a, b) =>
    a.entityId.localeCompare(b.entityId),
  )) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`system-entity-release:${member.entityId}`},0))`.execute(
      database,
    );
    const changeSet = await repository.get(member.changeSetId);
    requirePolicy(changeSet, "SOURCE_UNAVAILABLE");
    if (!nativeSource) throw Error("NATIVE_PUBLICATION_HOST_NOT_CONFIGURED");
    const source = await nativeSource(database, member.changeSetId);
    const graph = source.graph;
    const artifact = compileNativePublication(source);
    const row = (
      await sql<{
        base_release_id: string | null;
        current_release_id: string | null;
      }>`SELECT c.base_release_id,
      (SELECT r.id FROM metadata.entity_release r WHERE r.entity_id=c.entity_id AND r.tenant_id IS NULL ORDER BY r.release_no DESC LIMIT 1) current_release_id
      FROM metadata.entity_change_set c WHERE c.id=${member.changeSetId}::uuid AND c.entity_id=${member.entityId}::uuid
      AND c.tenant_id IS NULL`.execute(database)
    ).rows[0];
    requirePolicy(
      row &&
        row.base_release_id === member.sourceReleaseId &&
        row.current_release_id === member.sourceReleaseId,
      "SOURCE_HEAD_CHANGED",
    );
    const receipts = (
      await sql<{
        receipt: ProductReviewReceipt;
      }>`SELECT receipt FROM metadata.entity_product_review_receipt
      WHERE authority_tenant_id=${tenantId}::uuid AND change_set_id=${member.changeSetId}::uuid`.execute(
        database,
      )
    ).rows.map((r) => r.receipt);
    const identities = (
      await sql<{
        valid: boolean;
      }>`SELECT publication.fn_human_review_identity_status(
      ${member.authorId}::uuid,${member.reviewerId}::uuid,${policy.authorPrincipalId}::uuid,${policy.publisherPrincipalId}::uuid) valid`.execute(
        database,
      )
    ).rows;
    requirePolicy(identities[0]?.valid === true, "IDENTITY_REVOKED");
    inspectHumanReviewedProduct(
      member,
      { changeSet, graph, artifact },
      { receipts, sourceReleaseId: row.base_release_id },
    );
    const previous = policy.predecessors.find(
      (p) => p.changeSetId === member.changeSetId,
    )?.predecessor;
    if (previous) {
      const pins = (
        await sql`SELECT id FROM metadata.entity_release WHERE id=${previous.authoringReleaseId}::uuid
        AND entity_id=${member.entityId}::uuid AND tenant_id IS NULL AND release_no=${previous.authoringReleaseNo}
        AND release_hash=${previous.authoringReleaseHash} AND contract_hash=${previous.contractHash}
        AND revision_id=${previous.revisionId}::uuid AND signature_algorithm='Ed25519' AND contract_signature IS NOT NULL`.execute(
          database,
        )
      ).rows;
      requirePolicy(pins.length === 1, "PREDECESSOR_CHANGED");
    }
  }
}
