import { NextResponse } from "next/server";

import { requireAdminSession } from "../../helpers";

import type { NextRequest } from "next/server";

import { readMeshAudit } from "@/lib/schema-manager/audit-writer";


interface RouteContext {
    params: Promise<{ entity: string }>;
}

/**
 * GET /api/admin/mesh/meta-studio/:entity/activity
 * Returns audit trail for this entity from Redis.
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;
    const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

    const entries = await readMeshAudit(auth.tenantId, {
        entityName: entity,
        limit: Math.min(limit, 200),
        offset: Math.max(offset, 0),
    });

    return NextResponse.json(
        { success: true, data: entries },
        { headers: { "X-Correlation-Id": auth.correlationId } },
    );
}
