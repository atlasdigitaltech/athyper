import { sql, type Kysely } from "kysely";
import type { PublicationPlane } from "@athyper/server-contract-publication";
import type { RecoverablePublicationCoordinate } from "./publication-jobs.js";

/** Calls the coordinate-only definer function; it never reads tenant rows directly. */
export class KyselyPublicationRecoveryDiscovery {
  constructor(private readonly database: Kysely<Record<string, never>>) {}

  async page(after: { createdAt: Date | string; deploymentId: string } | undefined, limit: number): Promise<readonly RecoverablePublicationCoordinate[]> {
    const rows = await sql<{
      tenant_id: string;
      deployment_id: string;
      target_plane: PublicationPlane;
      created_at: string;
    }>`SELECT tenant_id, deployment_id, target_plane, created_at::text AS created_at FROM publication.fn_recoverable_deployment_coordinates(
      ${after?.createdAt ?? null}::timestamptz,
      ${after?.deploymentId ?? null}::uuid,
      ${Math.max(1, Math.min(200, Math.trunc(limit)))})`.execute(this.database);
    return rows.rows.map(row => ({
      tenantId: row.tenant_id,
      deploymentId: row.deployment_id,
      targetPlane: row.target_plane,
      // Preserve PostgreSQL microseconds: a JS Date truncates the page boundary
      // and can select the last row again on the next page.
      createdAt: row.created_at,
    }));
  }
}
