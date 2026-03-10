import { NextResponse } from "next/server";

import {
  proxyGet,
  proxyMutate,
  requireAdminSession,
} from "../../helpers";
import { hasDirectDb, fetchPublishValidationData } from "../../db";

import type { EntitySummary } from "@/lib/schema-manager/types";
import type { NextRequest } from "next/server";

import { MeshAuditEvent, hashSidForAudit } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";
import { validatePublishReadiness } from "@/lib/entity-meta-utils";

interface RouteContext {
  params: Promise<{ entity: string }>;
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/publish
 * Transitions current draft version to "published".
 * Triggers recompilation first, then runs publish-time validation,
 * and finally publishes.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;
  const entityPath = `/api/meta/entities/${encodeURIComponent(entity)}`;

  // 1. Get current entity to verify draft status
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

  if (metaBody.data.currentVersion.status !== "draft") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "IMMUTABLE_VERSION",
          message: "Only draft versions can be published",
        },
      },
      { status: 409 },
    );
  }

  // 2. Trigger compilation
  await proxyMutate(auth, `${entityPath}/compile`, "POST");

  // 3. Publish-time cross-entity validation (when direct DB is available)
  if (hasDirectDb()) {
    const validationData = await fetchPublishValidationData(
      entity,
      metaBody.data.currentVersion.id,
      auth.tenantId,
    );

    if (validationData) {
      const result = validatePublishReadiness(validationData);

      if (!result.valid) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PUBLISH_VALIDATION_FAILED",
              message: "Entity failed publish-time consistency checks",
              issues: [...result.errors, ...result.warnings],
            },
          },
          { status: 422 },
        );
      }

      // Warnings are non-blocking but included in the response
      if (result.warnings.length > 0) {
        // Stash warnings to include in the success response below
        (context as any)._publishWarnings = result.warnings;
      }
    }
  }

  // 4. Proxy to runtime publish endpoint
  const response = await proxyMutate(auth, `${entityPath}/versions`, "POST", {
    action: "publish",
    versionId: metaBody.data.currentVersion.id,
  });

  // 5. Audit (best-effort)
  await emitMeshAudit(MeshAuditEvent.VERSION_PUBLISHED, {
    tenantId: auth.tenantId,
    sidHash: hashSidForAudit(auth.sid),
    entityName: entity,
    entityId: metaBody.data.id,
    versionId: metaBody.data.currentVersion.id,
    correlationId: auth.correlationId,
    meta: { versionNo: metaBody.data.currentVersion.versionNo },
  });

  // If the upstream response is success and we have warnings, augment the body
  const warnings = (context as any)._publishWarnings;
  if (warnings?.length && response.ok) {
    const body = await response.json();
    return NextResponse.json({ ...body, warnings }, { status: 200 });
  }

  return response;
}
