/**
 * Archive Lifecycle & Purge Certificate API
 *
 * GET /api/admin/governance/archive → archive manifests + purge certificates
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getApiContext, resolveTenantUuid, unauthorizedResponse } from "@/lib/api-context";

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
      { status: 503 },
    );
  }

  const { context } = await getApiContext();
  if (!context) return unauthorizedResponse();
  const tid = await resolveTenantUuid(db, context.tenantId);

  try {
    const [manifests, certificates, restoreRequests] = await Promise.all([
      // Archive manifests
      sql<{
        id: string;
        partition_name: string;
        partition_month: Date;
        partition_domain: string | null;
        archive_format: string;
        storage_uri: string;
        sha256: string;
        row_count: number;
        size_bytes: number | null;
        archived_at: Date;
        archived_by: string;
        verified_at: Date | null;
        verified_by: string | null;
        detached_at: Date | null;
        detached_by: string | null;
        restored_at: Date | null;
        restored_by: string | null;
        tier_at_archive: string;
      }>`
        SELECT id, partition_name, partition_month, partition_domain,
               archive_format, storage_uri, sha256, row_count, size_bytes,
               archived_at, archived_by, verified_at, verified_by,
               detached_at, detached_by, restored_at, restored_by,
               tier_at_archive
        FROM evt.archive_manifest
        WHERE tenant_id = ${tid}::uuid
        ORDER BY partition_month DESC
        LIMIT 50
      `.execute(db),

      // Purge certificates
      sql<{
        id: string;
        partition_name: string;
        partition_month: Date;
        archive_sha256: string;
        row_count: number;
        purge_reason: string;
        compliance_framework: string | null;
        requested_by: string;
        requested_at: Date;
        approved_by: string;
        approved_at: Date;
        purged_by: string;
        purged_at: Date;
        purge_method: string;
        deletion_verified: boolean;
      }>`
        SELECT id, partition_name, partition_month, archive_sha256, row_count,
               purge_reason, compliance_framework,
               requested_by, requested_at, approved_by, approved_at,
               purged_by, purged_at, purge_method, deletion_verified
        FROM evt.purge_certificate
        WHERE tenant_id = ${tid}::uuid
        ORDER BY purged_at DESC
        LIMIT 50
      `.execute(db),

      // Active restore requests
      sql<{
        id: string;
        manifest_id: string;
        requested_by: string;
        requested_at: Date;
        reason: string;
        status: string;
        approved_by: string | null;
        approved_at: Date | null;
        completed_at: Date | null;
        error_message: string | null;
      }>`
        SELECT id, manifest_id, requested_by, requested_at, reason, status,
               approved_by, approved_at, completed_at, error_message
        FROM evt.restore_request
        WHERE tenant_id = ${tid}::uuid
        ORDER BY requested_at DESC
        LIMIT 20
      `.execute(db),
    ]);

    // Check held manifests
    const manifestIds = manifests.rows.map((m) => m.id);
    let heldManifestIds = new Set<string>();
    if (manifestIds.length > 0) {
      const held = await sql<{ manifest_id: string }>`
        SELECT DISTINCT manifest_id
        FROM core.legal_hold_manifest
        WHERE released_at IS NULL
          AND manifest_id = ANY(${manifestIds}::uuid[])
      `.execute(db);
      heldManifestIds = new Set(held.rows.map((r) => r.manifest_id));
    }

    return NextResponse.json({
      success: true,
      data: {
        manifests: manifests.rows.map((m) => {
          const lifecycle =
            m.restored_at ? "RESTORED" :
            m.detached_at ? "DETACHED" :
            m.verified_at ? "VERIFIED" :
            "ARCHIVED";
          return {
            id: m.id,
            partitionName: m.partition_name,
            partitionMonth: m.partition_month,
            partitionDomain: m.partition_domain,
            archiveFormat: m.archive_format,
            storageUri: m.storage_uri,
            sha256: m.sha256,
            rowCount: m.row_count,
            sizeBytes: m.size_bytes,
            lifecycle,
            archivedAt: m.archived_at,
            archivedBy: m.archived_by,
            verifiedAt: m.verified_at,
            detachedAt: m.detached_at,
            restoredAt: m.restored_at,
            tierAtArchive: m.tier_at_archive,
            isHeld: heldManifestIds.has(m.id),
          };
        }),
        purgeCertificates: certificates.rows.map((c) => ({
          id: c.id,
          partitionName: c.partition_name,
          partitionMonth: c.partition_month,
          sha256: c.archive_sha256,
          rowCount: c.row_count,
          purgeReason: c.purge_reason,
          complianceFramework: c.compliance_framework,
          requestedBy: c.requested_by,
          requestedAt: c.requested_at,
          approvedBy: c.approved_by,
          approvedAt: c.approved_at,
          purgedBy: c.purged_by,
          purgedAt: c.purged_at,
          purgeMethod: c.purge_method,
          deletionVerified: c.deletion_verified,
        })),
        restoreRequests: restoreRequests.rows.map((r) => ({
          id: r.id,
          manifestId: r.manifest_id,
          requestedBy: r.requested_by,
          requestedAt: r.requested_at,
          reason: r.reason,
          status: r.status,
          approvedBy: r.approved_by,
          approvedAt: r.approved_at,
          completedAt: r.completed_at,
          errorMessage: r.error_message,
        })),
      },
    });
  } catch (err) {
    console.error("[governance/archive] Error:", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}
