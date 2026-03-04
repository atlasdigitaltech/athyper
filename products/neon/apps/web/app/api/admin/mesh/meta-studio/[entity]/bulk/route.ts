import { NextResponse } from "next/server";

import { assertDraftVersion, parseJsonBody, proxyMutate, requireAdminSession } from "../../helpers";

import type { NextRequest } from "next/server";

import { hashSidForAudit, MeshAuditEvent } from "@/lib/schema-manager/audit";
import { emitMeshAudit } from "@/lib/schema-manager/audit-writer";


interface RouteContext {
    params: Promise<{ entity: string }>;
}

interface BulkFieldEntry {
    name: string;
    columnName?: string;
    dataType: string;
    isRequired?: boolean;
    isUnique?: boolean;
    isSearchable?: boolean;
    isFilterable?: boolean;
    defaultValue?: unknown;
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/bulk
 * Bulk-creates fields from a validated array.
 *
 * Body: { fields: BulkFieldEntry[] }
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { entity } = await context.params;

    const versionGuard = await assertDraftVersion(auth, entity);
    if (versionGuard) return versionGuard;

    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.body as { fields?: BulkFieldEntry[] };
    if (!Array.isArray(body.fields) || body.fields.length === 0) {
        return NextResponse.json(
            { success: false, error: { code: "INVALID_BODY", message: "Body must contain a non-empty 'fields' array" } },
            { status: 400 },
        );
    }

    if (body.fields.length > 100) {
        return NextResponse.json(
            { success: false, error: { code: "TOO_MANY_FIELDS", message: "Maximum 100 fields per bulk import" } },
            { status: 400 },
        );
    }

    // Create each field sequentially (order matters for sortOrder)
    const results: { name: string; success: boolean; error?: string }[] = [];
    let successCount = 0;

    for (const fieldEntry of body.fields) {
        const fieldBody = {
            name: fieldEntry.name,
            columnName: fieldEntry.columnName ?? fieldEntry.name,
            dataType: fieldEntry.dataType,
            isRequired: fieldEntry.isRequired ?? false,
            isUnique: fieldEntry.isUnique ?? false,
            isSearchable: fieldEntry.isSearchable ?? false,
            isFilterable: fieldEntry.isFilterable ?? false,
            defaultValue: fieldEntry.defaultValue ?? null,
        };

        const response = await proxyMutate(
            auth,
            `/api/meta/entities/${encodeURIComponent(entity)}/fields`,
            "POST",
            fieldBody,
        );

        if (response.status < 400) {
            results.push({ name: fieldEntry.name, success: true });
            successCount++;
        } else {
            const resBody = (await response.json()) as { error?: { message?: string } };
            results.push({
                name: fieldEntry.name,
                success: false,
                error: resBody.error?.message ?? `Failed (${response.status})`,
            });
        }
    }

    // Emit a single audit event for the bulk operation
    if (successCount > 0) {
        await emitMeshAudit(MeshAuditEvent.FIELD_ADDED, {
            tenantId: auth.tenantId,
            sidHash: hashSidForAudit(auth.sid),
            entityName: entity,
            correlationId: auth.correlationId,
            meta: { bulk: true, totalFields: body.fields.length, successCount },
            after: results,
        });
    }

    return NextResponse.json({
        success: true,
        data: {
            totalRequested: body.fields.length,
            successCount,
            failCount: body.fields.length - successCount,
            results,
        },
    });
}
