import { assertDraftVersion, proxyMutate, requireAdminSession } from "../../helpers";

import type { NextRequest } from "next/server";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";


interface RouteContext {
    params: Promise<{ entity: string }>;
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/compile
 * Triggers recompilation of the entity schema.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;

    const versionGuard = await assertDraftVersion(auth, entity);
    if (versionGuard) return versionGuard;

    const response = await proxyMutate(
        auth,
        `/api/meta/entities/${encodeURIComponent(entity)}/compile`,
        "POST",
    );

    if (response.status < 400) {
        await emitMeshAudit(MeshAuditEvent.SCHEMA_COMPILED, {
            tenantId: auth.tenantId,
            sidHash: hashSidForAudit(auth.sid),
            entityName: entity,
            correlationId: auth.correlationId,
        });
    }

    return response;
}
