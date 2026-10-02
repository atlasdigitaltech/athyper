import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { readinessInventoryDescriptors } from "@athyper/server-platform-metadata";
import { sql, type Kysely } from "kysely";

type InventoryRow = Parameters<typeof readinessInventoryDescriptors>[0];
type Plane = Parameters<typeof readinessInventoryDescriptors>[1];

/** Read the locked historical target, never the current metadata head. The
 * transaction and tenant stamp belong to the existing rollback executor. */
export async function assertRollbackEntityReadiness(
  transaction: Kysely<Record<string, never>>,
  appliedReleaseId: string,
  plane: Plane,
  readiness: {
    assertActivationDescriptors(
      descriptors: readonly EntityRuntimeDescriptor[],
    ): Promise<void>;
  },
): Promise<void> {
  const rows = await sql<InventoryRow>`
    SELECT a.manifest->>'artifactKind' AS artifact_kind,
           a.source_release_id::text, a.source_release_no::int,
           d.descriptor_kind::text,
           CASE WHEN d.id IS NOT NULL THEN jsonb_build_object(
             'entity_code', c.entity_code, 'release_id', c.release_id::text,
             'release_no', c.release_no, 'entity_contract_hash', c.entity_contract_hash,
             'plane_code', d.plane_code, 'compiled_hash', d.compiled_hash,
             'compiled_json', d.compiled_json) END AS descriptor,
           p.payload_json AS payload
      FROM runtime_meta.applied_release a
      LEFT JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id
      LEFT JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id
      LEFT JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id AND p.artifact_kind='compiled_entity_runtime'
     WHERE a.id=${appliedReleaseId}::uuid
  `.execute(transaction);
  if (rows.rows.length !== 1)
    throw Error("PUBLICATION_ROLLBACK_READINESS_TARGET_REQUIRED");
  const row = rows.rows[0]!;
  if (
    row.artifact_kind !== "entity_runtime" &&
    row.artifact_kind !== "compiled_entity_runtime"
  )
    return;
  await readiness.assertActivationDescriptors(
    readinessInventoryDescriptors(row, plane),
  );
}
