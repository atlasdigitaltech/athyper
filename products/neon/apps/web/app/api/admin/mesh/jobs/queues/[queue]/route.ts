import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../../meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
    params: Promise<{ queue: string }>;
}

/**
 * GET /api/admin/mesh/jobs/queues/:queue
 * Returns jobs for a specific queue with optional status filter.
 *
 * Query params: ?status=pending|active|completed|failed|delayed&limit=50&offset=0
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { queue } = await context.params;
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status") ?? "active";
    const limit = searchParams.get("limit") ?? "50";
    const offset = searchParams.get("offset") ?? "0";

    try {
        const qs = new URLSearchParams({ status, limit, offset });
        const res = await fetch(
            `${auth.runtimeApiUrl}/api/admin/jobs/queues/${encodeURIComponent(queue)}?${qs.toString()}`,
            {
                headers: {
                    "X-Correlation-Id": auth.correlationId,
                    "X-Tenant-Id": auth.tenantId,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!res.ok) {
            return NextResponse.json(
                { success: false, error: { code: "UPSTREAM_ERROR", message: `Failed to fetch jobs (${res.status})` } },
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

/**
 * POST /api/admin/mesh/jobs/queues/:queue
 * Queue actions: pause, resume.
 *
 * Body: { action: "pause" | "resume" }
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { queue } = await context.params;
    const body = (await request.json()) as { action?: string };

    if (!body.action || !["pause", "resume"].includes(body.action)) {
        return NextResponse.json(
            { success: false, error: { code: "INVALID_ACTION", message: "action must be 'pause' or 'resume'" } },
            { status: 400 },
        );
    }

    try {
        const res = await fetch(
            `${auth.runtimeApiUrl}/api/admin/jobs/queues/${encodeURIComponent(queue)}/${body.action}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Correlation-Id": auth.correlationId,
                    "X-Tenant-Id": auth.tenantId,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!res.ok) {
            return NextResponse.json(
                { success: false, error: { code: "ACTION_FAILED", message: `Queue ${body.action} failed (${res.status})` } },
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
