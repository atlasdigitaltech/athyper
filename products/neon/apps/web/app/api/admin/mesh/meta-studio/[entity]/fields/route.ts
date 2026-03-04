import { NextResponse } from "next/server";

import { hasDirectDb, listFieldsDirect } from "../../db";
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
      const result = await listFieldsDirect(entity);
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
  const isUpdate = body && typeof body.fieldId === "string" && !isReorder;

  const schema = isReorder
    ? reorderFieldsSchema
    : isUpdate
      ? updateFieldSchema
      : createFieldSchema;
  const validated = validateBody(parsed.body, schema as ZodSchema);
  if (!validated.ok) return validated.response;

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
