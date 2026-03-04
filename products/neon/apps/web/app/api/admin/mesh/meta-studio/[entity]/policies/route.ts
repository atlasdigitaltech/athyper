import { NextResponse } from "next/server";

import { hasDirectDb, getPoliciesDirect } from "../../db";
import { assertDraftVersion, parseJsonBody, proxyGet, proxyMutate, requireAdminSession, validateBody } from "../../helpers";
import { saveFieldSecuritySchema, savePolicySchema } from "../../schemas";

import type { NextRequest } from "next/server";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";


interface RouteContext {
    params: Promise<{ entity: string }>;
}

/**
 * GET /api/admin/mesh/meta-studio/:entity/policies
 * Returns both entity policies and field security policies.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;

    if (hasDirectDb()) {
        try {
            const result = await getPoliciesDirect(entity);
            return NextResponse.json(result);
        } catch (err) {
            console.error("[meta-studio] Direct DB get policies failed:", err);
            return NextResponse.json(
                { success: false, error: { code: "DB_ERROR", message: String(err) } },
                { status: 500 },
            );
        }
    }

    return proxyGet(auth, `/api/meta/entities/${encodeURIComponent(entity)}/policies`);
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/policies
 * Saves entity policy or field security policy (determined by body shape).
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;

    const versionGuard = await assertDraftVersion(auth, entity);
    if (versionGuard) return versionGuard;

    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    // Determine if this is a field security policy (has fieldPath) or entity policy
    const body = parsed.body as Record<string, unknown>;
    const isFieldSecurity = body && typeof body.fieldPath === "string";

    const validated = isFieldSecurity
        ? validateBody(parsed.body, saveFieldSecuritySchema)
        : validateBody(parsed.body, savePolicySchema);
    if (!validated.ok) return validated.response;

    const ifMatch = request.headers.get("If-Match");
    const response = await proxyMutate(
        auth,
        `/api/meta/entities/${encodeURIComponent(entity)}/policies`,
        "POST",
        validated.data,
        { ifMatch },
    );

    if (response.status < 400) {
        await emitMeshAudit(MeshAuditEvent.POLICY_UPDATED, {
            tenantId: auth.tenantId,
            sidHash: hashSidForAudit(auth.sid),
            entityName: entity,
            correlationId: auth.correlationId,
            after: validated.data,
            meta: { isFieldSecurity },
        });
    }

    return response;
}
