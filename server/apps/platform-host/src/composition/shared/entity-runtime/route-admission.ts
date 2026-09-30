import { sql, type Kysely } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";

/** Enumerate only active, tenant-visible compiled members. Descriptor resolution
 * is through the same exact-plane pinned reader used by record APIs. */
export async function readPublishedEntityRouteCandidates(context: VerifiedRequestContext, metadata: MetadataReader,
  transaction: <T>(work: (db: Kysely<Record<string, never>>) => Promise<T>) => Promise<T>) {
  const rows = await transaction(async db => (await sql<{ entity_code: string; release_id: string }>`
    SELECT DISTINCT member->>'entityCode' entity_code, a.source_release_id::text release_id
    FROM runtime_meta.release_activation_head h
    JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
    JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id
    CROSS JOIN LATERAL jsonb_array_elements(p.payload_json->'release'->'artifacts') member
    WHERE p.artifact_kind='compiled_entity_runtime' AND member->>'artifactType'='core'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.payload_json->'release'->'artifacts') runtime_member
        WHERE runtime_member->>'artifactType'='runtime_contract'
          AND runtime_member->>'entityCode'=member->>'entityCode')
      AND (p.tenant_id IS NULL OR p.tenant_id=${context.tenantId}::uuid)
    ORDER BY entity_code`.execute(db)).rows);
  const result = [];
  for (const entityCode of new Set(rows.map(row => row.entity_code))) {
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(entityCode)) continue;
    const descriptor = await metadata.getEntityDescriptor(context, entityCode);
    if (!descriptor || descriptor.planeKey !== context.planeKey || descriptor.entityCode !== entityCode
      || !rows.some(row => row.entity_code === entityCode && row.release_id === descriptor.releaseId)) continue;
    result.push({ entityCode: descriptor.entityCode, releaseId: descriptor.releaseId, operations: {
      ...(descriptor.operations.list ? { list: descriptor.operations.list.permissionCode } : {}),
      ...(descriptor.operations.read ? { read: descriptor.operations.read.permissionCode } : {}),
    } });
  }
  return result;
}
