import { NextResponse } from "next/server";

import {
  hasDirectDb,
  getEntityDirect,
  updateEntityDirect,
  deleteEntityDirect,
} from "../db";
import {
  assertDraftVersion,
  parseJsonBody,
  proxyGet,
  proxyMutate,
  requireAdminSession,
  validateBody,
} from "../helpers";
import { updateEntitySchema } from "../schemas";

import type { NextRequest } from "next/server";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";

interface RouteContext {
  params: Promise<{ entity: string }>;
}

/**
 * GET /api/admin/mesh/meta-studio/:entity
 * Returns entity metadata including current version summary.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  if (hasDirectDb()) {
    try {
      const result = await getEntityDirect(entity, auth.tenantId);
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          },
          { status: 404 },
        );
      }
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB get failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  return proxyGet(auth, `/api/meta/entities/${encodeURIComponent(entity)}`);
}

/**
 * PUT /api/admin/mesh/meta-studio/:entity
 * Updates entity metadata.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  const versionGuard = await assertDraftVersion(auth, entity);
  if (versionGuard) return versionGuard;

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const validated = validateBody(parsed.body, updateEntitySchema);
  if (!validated.ok) return validated.response;

  if (hasDirectDb()) {
    try {
      const result = await updateEntityDirect(
        entity,
        validated.data as Record<string, unknown>,
        auth.tenantId,
      );
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          },
          { status: 404 },
        );
      }
      await emitMeshAudit(MeshAuditEvent.ENTITY_UPDATED, {
        tenantId: auth.tenantId,
        sidHash: hashSidForAudit(auth.sid),
        entityName: entity,
        correlationId: auth.correlationId,
        after: validated.data,
      });
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB update failed:", err);
    }
  }

  const ifMatch = request.headers.get("If-Match");
  const response = await proxyMutate(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}`,
    "PUT",
    validated.data,
    { ifMatch },
  );

  if (response.status < 400) {
    await emitMeshAudit(MeshAuditEvent.ENTITY_UPDATED, {
      tenantId: auth.tenantId,
      sidHash: hashSidForAudit(auth.sid),
      entityName: entity,
      correlationId: auth.correlationId,
      after: validated.data,
    });
  }

  return response;
}

/**
 * DELETE /api/admin/mesh/meta-studio/:entity
 * Deletes an entity definition.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  if (hasDirectDb()) {
    try {
      const result = await deleteEntityDirect(entity, auth.tenantId);
      await emitMeshAudit(MeshAuditEvent.ENTITY_DELETED, {
        tenantId: auth.tenantId,
        sidHash: hashSidForAudit(auth.sid),
        entityName: entity,
        correlationId: auth.correlationId,
      });
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB delete failed:", err);
    }
  }

  const ifMatch = request.headers.get("If-Match");
  const response = await proxyMutate(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}`,
    "DELETE",
    undefined,
    { ifMatch },
  );

  if (response.status < 400) {
    await emitMeshAudit(MeshAuditEvent.ENTITY_DELETED, {
      tenantId: auth.tenantId,
      sidHash: hashSidForAudit(auth.sid),
      entityName: entity,
      correlationId: auth.correlationId,
    });
  }

  return response;
}
