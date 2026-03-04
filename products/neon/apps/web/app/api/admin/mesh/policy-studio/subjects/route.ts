import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../meta-studio/helpers";

import type { NextRequest } from "next/server";

/**
 * GET /api/admin/mesh/policy-studio/subjects?type=kc_role&q=admin
 * Searches for subject keys by type (roles, groups, users, services).
 * Proxies to runtime IAM endpoint with graceful fallback.
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "kc_role";
    const q = searchParams.get("q") ?? "";

    try {
        const res = await fetch(
            `${auth.runtimeApiUrl}/api/iam/subjects?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`,
            {
                headers: {
                    "X-Correlation-Id": auth.correlationId,
                    "X-Tenant-Id": auth.tenantId,
                },
                signal: AbortSignal.timeout(5_000),
            },
        );

        if (!res.ok) {
            // Graceful fallback: return empty results so the picker degrades to free-text
            return NextResponse.json(
                { success: true, data: [] },
                { headers: { "X-Correlation-Id": auth.correlationId } },
            );
        }

        const data: unknown = await res.json();
        return NextResponse.json(
            { success: true, ...(typeof data === "object" && data !== null ? data : { data }) },
            { headers: { "X-Correlation-Id": auth.correlationId } },
        );
    } catch {
        // Graceful fallback on any error
        return NextResponse.json(
            { success: true, data: [] },
            { headers: { "X-Correlation-Id": auth.correlationId } },
        );
    }
}
