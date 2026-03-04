import { NextResponse } from "next/server";

import { parseJsonBody, proxyGet, requireAdminSession } from "../../helpers";

import type { FieldDefinition, IndexDefinition, RelationDefinition } from "@/lib/schema-manager/types";
import type { NextRequest } from "next/server";

import { validateField, validateRelation, validateIndex, validatePolicy } from "@/lib/schema-manager/validation";


interface RouteContext {
    params: Promise<{ entity: string }>;
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/validate
 * Dry-run validation without persisting.
 *
 * Body: { type: "field"|"relation"|"index"|"policy", data: {...}, editingId?: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;

    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.body as { type: string; data: Record<string, unknown>; editingId?: string };
    if (!body.type || !body.data) {
        return NextResponse.json(
            { success: false, error: { code: "INVALID_BODY", message: "Missing 'type' or 'data' in request body" } },
            { status: 400 },
        );
    }

    const entityPath = `/api/meta/entities/${encodeURIComponent(entity)}`;

    switch (body.type) {
        case "field": {
            const fieldsRes = await proxyGet(auth, `${entityPath}/fields`);
            const fieldsBody = (await fieldsRes.json()) as { data?: FieldDefinition[] };
            const existingFields = fieldsBody.data ?? [];
            const result = validateField(
                body.data as { name: string; columnName?: string; dataType: string },
                existingFields,
                body.editingId,
            );
            return NextResponse.json({ success: true, data: result });
        }
        case "relation": {
            const relRes = await proxyGet(auth, `${entityPath}/relations`);
            const relBody = (await relRes.json()) as { data?: RelationDefinition[] };
            const existingRelations = relBody.data ?? [];
            const result = validateRelation(
                body.data as { name: string; relationKind: string; targetEntity: string },
                existingRelations,
                entity,
            );
            return NextResponse.json({ success: true, data: result });
        }
        case "index": {
            const [idxRes, fieldsRes] = await Promise.all([
                proxyGet(auth, `${entityPath}/indexes`),
                proxyGet(auth, `${entityPath}/fields`),
            ]);
            const idxBody = (await idxRes.json()) as { data?: IndexDefinition[] };
            const fieldsBody = (await fieldsRes.json()) as { data?: FieldDefinition[] };
            const result = validateIndex(
                body.data as { name: string; columns: string[]; method?: string; isUnique?: boolean },
                idxBody.data ?? [],
                fieldsBody.data ?? [],
            );
            return NextResponse.json({ success: true, data: result });
        }
        case "policy": {
            const fieldsRes = await proxyGet(auth, `${entityPath}/fields`);
            const fieldsBody = (await fieldsRes.json()) as { data?: FieldDefinition[] };
            const result = validatePolicy(
                body.data as { fieldPath?: string },
                fieldsBody.data ?? [],
            );
            return NextResponse.json({ success: true, data: result });
        }
        default:
            return NextResponse.json(
                { success: false, error: { code: "INVALID_TYPE", message: `Unknown validation type: '${body.type}'` } },
                { status: 400 },
            );
    }
}
