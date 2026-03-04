import { proxyGet, requireAdminSession } from "../../helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
    params: Promise<{ entity: string }>;
}

/**
 * GET /api/admin/mesh/meta-studio/:entity/lifecycle
 * Returns the lifecycle state machine bound to this entity (404 if none).
 */
export async function GET(_request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;
    return proxyGet(auth, `/api/meta/entities/${encodeURIComponent(entity)}/lifecycle`);
}
