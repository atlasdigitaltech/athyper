import { NextResponse } from "next/server";

import { parseJsonBody, requireAdminSession } from "../../helpers";

import type {
  ChangeRequest,
  ChangeRequestChange,
  ChangeRequestStatus,
} from "@/lib/schema-manager/change-request";
import type { NextRequest } from "next/server";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";
import {
  assessRiskLevel,
  canTransition,
} from "@/lib/schema-manager/change-request";

interface RouteContext {
  params: Promise<{ entity: string }>;
}

// In-memory store for change requests (would be Redis/DB in production)
const changeRequestStore = new Map<string, ChangeRequest[]>();

function getEntityCRs(entity: string): ChangeRequest[] {
  return changeRequestStore.get(entity) ?? [];
}

/**
 * GET /api/admin/mesh/meta-studio/:entity/change-requests
 * Lists change requests for the entity.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;
  const crs = getEntityCRs(entity);

  return NextResponse.json({ success: true, data: crs });
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/change-requests
 * Creates a new change request or updates an existing one.
 *
 * Body for create: { action: "create", title: string, rationale: string, changes?: ChangeRequestChange[] }
 * Body for status transition: { action: "transition", crId: string, status: ChangeRequestStatus, comment?: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as Record<string, unknown>;
  const action = body.action as string;

  if (action === "create") {
    const title = body.title as string;
    const rationale = (body.rationale as string) ?? "";
    const changes = (body.changes as ChangeRequestChange[]) ?? [];

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_BODY", message: "Title is required" },
        },
        { status: 400 },
      );
    }

    const cr: ChangeRequest = {
      id: crypto.randomUUID(),
      entityName: entity,
      versionId: "",
      title,
      rationale,
      riskLevel: assessRiskLevel(changes),
      status: "draft",
      author: hashSidForAudit(auth.sid),
      authorSidHash: hashSidForAudit(auth.sid),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      changes,
      diagnostics: [],
    };

    const crs = getEntityCRs(entity);
    crs.push(cr);
    changeRequestStore.set(entity, crs);

    await emitMeshAudit(MeshAuditEvent.ENTITY_UPDATED, {
      tenantId: auth.tenantId,
      sidHash: hashSidForAudit(auth.sid),
      entityName: entity,
      correlationId: auth.correlationId,
      meta: { action: "change_request_created", crId: cr.id },
    });

    return NextResponse.json({ success: true, data: cr }, { status: 201 });
  }

  if (action === "transition") {
    const crId = body.crId as string;
    const newStatus = body.status as ChangeRequestStatus;
    const comment = (body.comment as string) ?? "";

    const crs = getEntityCRs(entity);
    const cr = crs.find((c) => c.id === crId);

    if (!cr) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Change request not found" },
        },
        { status: 404 },
      );
    }

    if (!canTransition(cr.status, newStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot transition from '${cr.status}' to '${newStatus}'`,
          },
        },
        { status: 400 },
      );
    }

    cr.status = newStatus;
    cr.updatedAt = new Date().toISOString();

    if (newStatus === "approved" || newStatus === "rejected") {
      cr.reviewedBy = hashSidForAudit(auth.sid);
      cr.reviewedAt = new Date().toISOString();
      cr.reviewComment = comment;
    }

    if (newStatus === "applied") {
      cr.appliedAt = new Date().toISOString();
    }

    await emitMeshAudit(MeshAuditEvent.ENTITY_UPDATED, {
      tenantId: auth.tenantId,
      sidHash: hashSidForAudit(auth.sid),
      entityName: entity,
      correlationId: auth.correlationId,
      meta: { action: `change_request_${newStatus}`, crId: cr.id },
    });

    return NextResponse.json({ success: true, data: cr });
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INVALID_ACTION",
        message: "Action must be 'create' or 'transition'",
      },
    },
    { status: 400 },
  );
}
