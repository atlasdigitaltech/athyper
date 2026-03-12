import { NextResponse } from "next/server";

import {
  createFieldDirect,
  deleteFieldDirect,
  deprecateFieldDirect,
  hasDirectDb,
  listFieldsDirect,
  reorderFieldsDirect,
  updateFieldDirect,
} from "../../db";
import {
  assertDraftVersion,
  parseJsonBody,
  proxyGet,
  proxyMutate,
  requireAdminSession,
  validateBody,
} from "../../helpers";
import {
  createFieldSchema,
  deleteFieldSchema,
  deprecateFieldSchema,
  reorderFieldsSchema,
  updateFieldSchema,
} from "../../schemas";

import type { NextRequest } from "next/server";
import type { ZodSchema } from "zod";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";

interface RouteContext {
  params: Promise<{ entity: string }>;
}

/**
 * GET /api/admin/mesh/meta-studio/:entity/fields
 * Lists fields for the entity's current version.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  if (hasDirectDb()) {
    try {
      const result = await listFieldsDirect(entity, auth.tenantId);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB list fields failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  return proxyGet(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}/fields`,
  );
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/fields
 * Adds a new field, updates an existing field, or reorders fields (based on body shape).
 *
 * Body discrimination:
 *   - { fieldIds: [...] }    → reorder
 *   - { fieldId: "...", ... } → update existing field
 *   - { name: "...", ... }    → create new field
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  // Enforce draft version guard
  const versionGuard = await assertDraftVersion(auth, entity);
  if (versionGuard) return versionGuard;

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  // Determine operation type from body shape
  const body = parsed.body as Record<string, unknown>;
  const isReorder = body && Array.isArray(body.fieldIds);
  const isDeprecate = body && typeof body.fieldId === "string" && typeof body.isDeprecated === "boolean" && Object.keys(body).length === 2;
  const isUpdate = body && typeof body.fieldId === "string" && !isReorder && !isDeprecate;

  const schema = isReorder
    ? reorderFieldsSchema
    : isDeprecate
      ? deprecateFieldSchema
      : isUpdate
        ? updateFieldSchema
        : createFieldSchema;
  const validated = validateBody(parsed.body, schema as ZodSchema);
  if (!validated.ok) return validated.response;

  // ── Direct DB path ──
  if (hasDirectDb()) {
    try {
      let result: { success: boolean; data?: unknown };
      if (isReorder) {
        result = await reorderFieldsDirect(entity, (validated.data as any).fieldIds, auth.tenantId);
      } else if (isDeprecate) {
        const { fieldId, isDeprecated } = validated.data as { fieldId: string; isDeprecated: boolean };
        result = await deprecateFieldDirect(fieldId, isDeprecated, auth.tenantId);
      } else if (isUpdate) {
        const { fieldId, ...fieldData } = validated.data as Record<string, unknown>;
        result = await updateFieldDirect(entity, fieldId as string, fieldData, auth.tenantId);
      } else {
        result = await createFieldDirect(entity, validated.data as Record<string, unknown>, auth.tenantId);
      }

      const event = isReorder
        ? MeshAuditEvent.FIELD_REORDERED
        : isDeprecate
          ? MeshAuditEvent.FIELD_UPDATED
          : isUpdate
            ? MeshAuditEvent.FIELD_UPDATED
            : MeshAuditEvent.FIELD_ADDED;

      await emitMeshAudit(event, {
        tenantId: auth.tenantId,
        sidHash: hashSidForAudit(auth.sid),
        entityName: entity,
        correlationId: auth.correlationId,
        after: validated.data,
      });

      return NextResponse.json(result, { status: isUpdate || isDeprecate ? 200 : 201 });
    } catch (err) {
      console.error("[meta-studio] Direct DB field mutation failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  // ── Proxy path ──
  const method = isUpdate ? "PUT" : "POST";
  const ifMatch = request.headers.get("If-Match");
  const response = await proxyMutate(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}/fields`,
    method,
    validated.data,
    { ifMatch },
  );

  // Emit audit on success
  if (response.status < 400) {
    const event = isReorder
      ? MeshAuditEvent.FIELD_REORDERED
      : isUpdate
        ? MeshAuditEvent.FIELD_UPDATED
        : MeshAuditEvent.FIELD_ADDED;

    await emitMeshAudit(event, {
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
 * DELETE /api/admin/mesh/meta-studio/:entity/fields
 * Deletes a field by ID.
 *
 * Body: { fieldId: "uuid" }
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  // Enforce draft version guard
  const versionGuard = await assertDraftVersion(auth, entity);
  if (versionGuard) return versionGuard;

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const validated = validateBody(parsed.body, deleteFieldSchema);
  if (!validated.ok) return validated.response;

  // ── Direct DB path ──
  if (hasDirectDb()) {
    try {
      const result = await deleteFieldDirect((validated.data as any).fieldId, auth.tenantId);

      if (!result.success && result.error) {
        const status = result.error.code === "PUBLISHED_GUARD" ? 409 : 400;
        return NextResponse.json(result, { status });
      }

      await emitMeshAudit(MeshAuditEvent.FIELD_DELETED, {
        tenantId: auth.tenantId,
        sidHash: hashSidForAudit(auth.sid),
        entityName: entity,
        correlationId: auth.correlationId,
        before: validated.data,
      });

      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB field delete failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  // ── Proxy path ──
  const ifMatch = request.headers.get("If-Match");
  const response = await proxyMutate(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}/fields`,
    "DELETE",
    validated.data,
    { ifMatch },
  );

  // Emit audit on success
  if (response.status < 400) {
    await emitMeshAudit(MeshAuditEvent.FIELD_DELETED, {
      tenantId: auth.tenantId,
      sidHash: hashSidForAudit(auth.sid),
      entityName: entity,
      correlationId: auth.correlationId,
      before: validated.data,
    });
  }

  return response;
}
