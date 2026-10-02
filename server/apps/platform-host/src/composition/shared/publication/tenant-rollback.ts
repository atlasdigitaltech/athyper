import { sql, type Kysely } from "kysely";
import { KyselyLocalProjectionRepository, type PublicationRollbackPayload } from "@athyper/server-service-publication";

type Database = Record<string, never>;
type Plane = PublicationRollbackPayload["targetPlane"];

interface AppliedCoordinate {
  readonly appliedReleaseId: string;
  readonly sourceReleaseId: string;
  readonly artifactHash: string;
}

/** Only a previously acknowledged local projection is an eligible rollback
 * target. The authority query is always restricted by tenant RLS and exact
 * tenant/key/plane/source/hash coordinates. */
export async function hasTenantRollbackMapping(
  authority: Kysely<Database>,
  input: { tenantId: string; publicationKey: string; targetPlane: Plane },
  applied: AppliedCoordinate,
): Promise<boolean> {
  return authority.transaction().execute(async tx => {
    await sql`SELECT set_config('app.current_tenant_id',${input.tenantId},true)`.execute(tx);
    const rows = await sql`SELECT 1 FROM publication.deployment_acknowledgement ack
      JOIN publication.deployment d ON d.id=ack.deployment_id
      JOIN publication.artifact a ON a.id=d.artifact_id
      JOIN publication.release r ON r.id=a.publication_release_id
      WHERE r.tenant_id=${input.tenantId}::uuid AND r.release_key=${input.publicationKey}
        AND r.id=${applied.sourceReleaseId}::uuid AND d.target_plane=${input.targetPlane}
        AND ack.local_applied_release_id=${applied.appliedReleaseId}::uuid
        AND ack.active_release_hash=${applied.artifactHash}
      LIMIT 1`.execute(tx);
    return rows.rows.length === 1;
  });
}

export async function hasTenantRollbackTarget(
  authority: Kysely<Database>,
  input: { tenantId: string; publicationKey: string; targetPlane: Plane; targetAppliedReleaseId: string },
): Promise<boolean> {
  return authority.transaction().execute(async tx => {
    await sql`SELECT set_config('app.current_tenant_id',${input.tenantId},true)`.execute(tx);
    const rows = await sql`SELECT 1 FROM publication.deployment_acknowledgement ack
      JOIN publication.deployment d ON d.id=ack.deployment_id
      JOIN publication.artifact a ON a.id=d.artifact_id
      JOIN publication.release r ON r.id=a.publication_release_id
      WHERE r.tenant_id=${input.tenantId}::uuid AND r.release_key=${input.publicationKey}
        AND d.target_plane=${input.targetPlane}
        AND ack.local_applied_release_id=${input.targetAppliedReleaseId}::uuid
      LIMIT 1`.execute(tx);
    return rows.rows.length === 1;
  });
}

/** Lock the local head and target while the authority verifies their immutable
 * acknowledgement mappings. A tenant sharing a publication key cannot retire
 * another tenant's current head or substitute another tenant's target. */
export function createTenantRollbackExecutor(
  local: Kysely<Database>,
  authority: Kysely<Database>,
  targetPlane: Plane,
  assertTargetReady: (transaction: Kysely<Database>, appliedReleaseId: string, plane: Plane) => Promise<void>,
) {
  return {
    async rollback(input: PublicationRollbackPayload) {
      if (input.targetPlane !== targetPlane) throw new Error("PUBLICATION_ROLLBACK_PLANE_MISMATCH");
      return local.transaction().execute(async tx => {
        await sql`SELECT set_config('app.current_tenant_id',${input.tenantId},true),
          set_config('app.current_principal_id',${input.actorId},true)`.execute(tx);
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.publicationKey},0))`.execute(tx);
        const rows = await sql<{
          current_id: string; current_source: string; current_hash: string;
          target_source: string; target_hash: string;
        }>`SELECT h.applied_release_id::text current_id,
          current_release.source_release_id::text current_source,
          current_release.artifact_hash current_hash,
          target.source_release_id::text target_source,
          target.artifact_hash target_hash
          FROM runtime_meta.release_activation_head h
          JOIN runtime_meta.applied_release current_release ON current_release.id=h.applied_release_id
          JOIN runtime_meta.applied_release target ON target.id=${input.targetAppliedReleaseId}::uuid
            AND target.publication_key=h.publication_key
          WHERE h.publication_key=${input.publicationKey}
          FOR UPDATE OF h,current_release,target`.execute(tx);
        const row = rows.rows[0];
        if (!row || !(await hasTenantRollbackMapping(authority, input, {
          appliedReleaseId: row.current_id, sourceReleaseId: row.current_source,
          artifactHash: row.current_hash,
        })) || !(await hasTenantRollbackMapping(authority, input, {
          appliedReleaseId: input.targetAppliedReleaseId, sourceReleaseId: row.target_source,
          artifactHash: row.target_hash,
        }))) throw new Error("PUBLICATION_ROLLBACK_TENANT_MAPPING_REQUIRED");
        // Rollback is another activation: historical acknowledgement cannot
        // substitute for support on the current serving deployment. Recheck
        // even an exact retry before changing or returning the head.
        await assertTargetReady(tx, input.targetAppliedReleaseId, targetPlane);
        return new KyselyLocalProjectionRepository(tx).rollback({
          publicationKey: input.publicationKey,
          targetAppliedReleaseId: input.targetAppliedReleaseId,
          evidence: { actorId: input.actorId, reason: input.reason, tenantId: input.tenantId,
            ...(input.operationId ? { operationId: input.operationId } : {}) },
        });
      });
    },
  };
}
