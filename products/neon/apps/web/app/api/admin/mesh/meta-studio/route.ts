import { NextResponse } from "next/server";

import { hasDirectDb, listEntitiesDirect, createEntityDirect } from "./db";
import {
  parseJsonBody,
  proxyGet,
  proxyMutate,
  requireAdminSession,
  validateBody,
} from "./helpers";
import { createEntitySchema } from "./schemas";

import type { NextRequest } from "next/server";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";

/**
 * GET /api/admin/mesh/meta-studio
 * Lists all entity definitions.
 */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  // Direct DB access — bypasses runtime API proxy
  if (hasDirectDb()) {
    try {
      const result = await listEntitiesDirect(auth.tenantId);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB list failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  return proxyGet(auth, "/api/meta/entities");
}

/**
 * POST /api/admin/mesh/meta-studio
 * Creates a new entity definition.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const validated = validateBody(parsed.body, createEntitySchema);
  if (!validated.ok) return validated.response;

  const entityName = (validated.data as { name?: string }).name ?? "unknown";

  // Direct DB access — bypasses runtime API proxy
  if (hasDirectDb()) {
    try {
      const result = await createEntityDirect(validated.data as any, auth.tenantId);
      await emitMeshAudit(MeshAuditEvent.ENTITY_CREATED, {
        tenantId: auth.tenantId,
        sidHash: hashSidForAudit(auth.sid),
        entityName,
        correlationId: auth.correlationId,
        after: validated.data,
      });
      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      console.error("[meta-studio] Direct DB create failed:", err);
      const message =
        err instanceof Error && err.message.includes("duplicate")
          ? `Entity '${entityName}' already exists`
          : "Failed to create entity";
      const code =
        err instanceof Error && err.message.includes("duplicate")
          ? "ENTITY_ALREADY_EXISTS"
          : "INTERNAL_ERROR";
      return NextResponse.json(
        { success: false, error: { code, message } },
        { status: code === "ENTITY_ALREADY_EXISTS" ? 409 : 500 },
      );
    }
  }

  const response = await proxyMutate(
    auth,
    "/api/meta/entities",
    "POST",
    validated.data,
  );

  if (response.status < 400) {
    await emitMeshAudit(MeshAuditEvent.ENTITY_CREATED, {
      tenantId: auth.tenantId,
      sidHash: hashSidForAudit(auth.sid),
      entityName,
      correlationId: auth.correlationId,
      after: validated.data,
    });
  }

  return response;
}
