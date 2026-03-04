import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../../meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
    params: Promise<{ policyId: string }>;
}

/**
 * POST /api/admin/mesh/policy-studio/:policyId/rules
 * Adds a new rule to the policy's current draft version.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { policyId } = await context.params;
    const body: unknown = await request.json();

    try {
        const res = await fetch(`${auth.runtimeApiUrl}/api/policies/${encodeURIComponent(policyId)}/rules`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Correlation-Id": auth.correlationId,
                "X-Tenant-Id": auth.tenantId,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });

        const data: unknown = await res.json();

        if (!res.ok) {
            return NextResponse.json(
                { success: false, error: { code: "RULE_CREATE_FAILED", message: `Failed to create rule (${res.status})` } },
                { status: res.status >= 500 ? 502 : res.status },
            );
        }

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
 * DELETE /api/admin/mesh/policy-studio/:policyId/rules
 * Deletes a rule by ID.
 * Body: { ruleId: string }
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { policyId } = await context.params;
    const body = (await request.json()) as { ruleId?: string };

    if (!body.ruleId) {
        return NextResponse.json(
            { success: false, error: { code: "MISSING_RULE_ID", message: "ruleId is required" } },
            { status: 400 },
        );
    }

    try {
        const res = await fetch(
            `${auth.runtimeApiUrl}/api/policies/${encodeURIComponent(policyId)}/rules/${encodeURIComponent(body.ruleId)}`,
            {
                method: "DELETE",
                headers: {
                    "X-Correlation-Id": auth.correlationId,
                    "X-Tenant-Id": auth.tenantId,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!res.ok) {
            return NextResponse.json(
                { success: false, error: { code: "RULE_DELETE_FAILED", message: `Failed to delete rule (${res.status})` } },
                { status: res.status >= 500 ? 502 : res.status },
            );
        }

        return NextResponse.json(
            { success: true },
            { headers: { "X-Correlation-Id": auth.correlationId } },
        );
    } catch (error) {
        return NextResponse.json(
            { success: false, error: { code: "PROXY_ERROR", message: String(error) } },
            { status: 502 },
        );
    }
}
