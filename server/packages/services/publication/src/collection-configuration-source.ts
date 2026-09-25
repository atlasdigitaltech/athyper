import { sql, type Kysely } from "kysely";
import {
  parseCollectionPublicationDescriptor,
  collectionPublicationKey,
} from "@athyper/server-contract-publication";
/** Must be called inside the verified request's tenant/plane transaction. */
export async function readPublishedCollectionConfiguration(
  db: Kysely<Record<string, never>>,
  tenantId: string,
  plane: "neon" | "mesh" | "studio",
  collectionKey: string,
) {
  if (!["activity.notifications", "activity.inbox"].includes(collectionKey))
    throw new TypeError("Unknown collection");
  const key = collectionPublicationKey(tenantId, collectionKey);
  const row = (
    await sql<
      Record<string, any>
    >`SELECT * FROM runtime_meta.fn_active_entity_descriptor(${key},'collection_configuration')`.execute(
      db,
    )
  ).rows[0];
  if (!row) return null;
  const descriptor = parseCollectionPublicationDescriptor(row.compiled_json);
  if (
    row.tenant_id !== tenantId ||
    row.plane_code !== plane ||
    row.entity_code !== descriptor.sourceEntityCode ||
    descriptor.configuration.collectionKey !== collectionKey ||
    !descriptor.configuration.targetPlanes.includes(plane)
  )
    throw new TypeError("Collection projection coordinates do not match");
  return {
    collectionKey,
    plane,
    releaseId: row.release_id,
    releaseNo: Number(row.release_no),
    compiledHash: row.compiled_hash,
    configuration: descriptor.configuration,
  };
}
