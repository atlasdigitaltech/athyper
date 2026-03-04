import { assertDraftVersion, parseJsonBody, proxyGet, proxyMutate, requireAdminSession, validateBody } from "../../helpers";
import { saveOverlaySchema } from "../../schemas";

import type { NextRequest } from "next/server";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";


interface RouteContext {
    params: Promise<{ entity: string }>;
}

/**
 * GET /api/admin/mesh/meta-studio/:entity/overlays
 */
export async function GET(_request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;
    return proxyGet(auth, `/api/meta/entities/${encodeURIComponent(entity)}/overlays`);
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/overlays
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;

    const versionGuard = await assertDraftVersion(auth, entity);
    if (versionGuard) return versionGuard;

    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const validated = validateBody(parsed.body, saveOverlaySchema);
    if (!validated.ok) return validated.response;

    const ifMatch = request.headers.get("If-Match");
    const response = await proxyMutate(
        auth,
        `/api/meta/entities/${encodeURIComponent(entity)}/overlays`,
        "POST",
        validated.data,
        { ifMatch },
    );

    if (response.status < 400) {
        await emitMeshAudit(MeshAuditEvent.OVERLAY_SAVED, {
            tenantId: auth.tenantId,
            sidHash: hashSidForAudit(auth.sid),
            entityName: entity,
            correlationId: auth.correlationId,
            after: validated.data,
        });
    }

    return response;
}
