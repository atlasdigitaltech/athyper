import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "../../meta-studio/helpers";

/**
 * POST /api/admin/mesh/policy-studio/simulate
 * Run a policy simulation (dry-run) and return the explain tree.
 */
export async function POST(req: NextRequest) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    try {
        const body = (await req.json()) as Record<string, unknown>;

        const res = await fetch(`${auth.runtimeApiUrl}/api/policy/simulate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Correlation-Id": auth.correlationId,
                "X-Tenant-Id": auth.tenantId,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "SIMULATION_FAILED",
                        message: `Simulation failed (${res.status}): ${errorText.substring(0, 200)}`,
                    },
                },
                { status: res.status >= 500 ? 502 : res.status },
            );
        }

        const data: unknown = await res.json();

        return NextResponse.json(
            { success: true, ...(typeof data === "object" && data !== null ? data : { data }) },
            { headers: { "X-Correlation-Id": auth.correlationId } },
        );
    } catch (error) {
        return NextResponse.json(
            { success: false, error: { code: "PROXY_ERROR", message: String(error) } },
            { status: 502 },
        );
    }
}
