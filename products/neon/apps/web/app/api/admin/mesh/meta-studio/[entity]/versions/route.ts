import { NextResponse } from "next/server";

import { hasDirectDb, listVersionsDirect } from "../../db";
import {
  parseJsonBody,
  proxyGet,
  proxyMutate,
  requireAdminSession,
  validateBody,
} from "../../helpers";
import { createVersionSchema } from "../../schemas";

import type { NextRequest } from "next/server";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";

interface RouteContext {
  params: Promise<{ entity: string }>;
}

/**
 * GET /api/admin/mesh/meta-studio/:entity/versions
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  if (hasDirectDb()) {
    try {
      const result = await listVersionsDirect(entity);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB list versions failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  return proxyGet(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}/versions`,
  );
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/versions
 * Creates a new version (clone from latest).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  let validatedData: Record<string, unknown> = {};
  try {
    const parsed = await parseJsonBody(request);
    if (parsed.ok) {
      const validated = validateBody(parsed.body, createVersionSchema);
      if (!validated.ok) return validated.response;
      validatedData = validated.data as Record<string, unknown>;
    }
  } catch {
    // Empty body is acceptable for version creation
  }

  const response = await proxyMutate(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}/versions`,
    "POST",
    validatedData,
  );

  if (response.status < 400) {
    await emitMeshAudit(MeshAuditEvent.VERSION_CREATED, {
      tenantId: auth.tenantId,
      sidHash: hashSidForAudit(auth.sid),
      entityName: entity,
      correlationId: auth.correlationId,
      after: validatedData,
    });
  }

  return response;
}
