import { NextResponse } from "next/server";

import { proxyGet, proxyMutate, requireAdminSession } from "../../helpers";

import type { EntitySummary } from "@/lib/schema-manager/types";
import type { NextRequest } from "next/server";

import { MeshAuditEvent, hashSidForAudit } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";

interface RouteContext {
  params: Promise<{ entity: string }>;
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/deprecate
 * Transitions published version to "archived".
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;
  const entityPath = `/api/meta/entities/${encodeURIComponent(entity)}`;

  // 1. Get current entity to verify published status
  const metaRes = await proxyGet(auth, entityPath);
  const metaBody = (await metaRes.json()) as {
    success: boolean;
    data?: EntitySummary;
  };
  if (!metaBody.success || !metaBody.data?.currentVersion) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Entity or version not found" },
      },
      { status: 404 },
    );
  }

  if (metaBody.data.currentVersion.status !== "published") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_STATE",
          message: "Only published versions can be deprecated",
        },
      },
      { status: 409 },
    );
  }

  // 2. Proxy to runtime deprecate endpoint
  const response = await proxyMutate(auth, `${entityPath}/versions`, "POST", {
    action: "deprecate",
    versionId: metaBody.data.currentVersion.id,
  });

  // 3. Audit (best-effort)
  await emitMeshAudit(MeshAuditEvent.VERSION_DEPRECATED, {
    tenantId: auth.tenantId,
    sidHash: hashSidForAudit(auth.sid),
    entityName: entity,
    entityId: metaBody.data.id,
    versionId: metaBody.data.currentVersion.id,
    correlationId: auth.correlationId,
    meta: { versionNo: metaBody.data.currentVersion.versionNo },
  });

  return response;
}
