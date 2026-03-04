import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
    params: Promise<{ integrationId: string }>;
}

function getBaselineIntegrationDetail(id: string) {
    const stubs: Record<string, object> = {
        "int-stub-erp": {
            id: "int-stub-erp",
            code: "erp-sync",
            name: "ERP Sync",
            description: "Synchronize master data with ERP system",
            endpointType: "rest_api",
            baseUrl: "https://erp.example.com/api/v2",
            authMethod: "oauth2",
            headers: { "X-Api-Version": "2.0" },
            timeoutMs: 30_000,
            retryPolicy: { maxAttempts: 3, backoffStrategy: "exponential", initialDelayMs: 1000 },
            circuitBreaker: { enabled: true, failureThreshold: 5, successThreshold: 2, timeoutMs: 60_000 },
            isActive: true,
            flows: [
                {
                    id: "flow-stub-1",
                    code: "sync-products",
                    name: "Product Sync",
                    entityName: "Product",
                    flowDirection: "inbound",
                    triggerMode: "scheduled",
                    scheduleCron: "0 */4 * * *",
                    syncMode: "incremental",
                    fieldMappingCount: 12,
                    isActive: true,
                    lastRunAt: "2026-02-18T08:00:00.000Z",
                    lastRunStatus: "success",
                },
            ],
            webhooks: [
                {
                    id: "wh-stub-1",
                    eventPattern: "order.created",
                    targetUrl: "https://erp.example.com/webhooks/orders",
                    authMethod: "hmac",
                    deliveryMode: "async",
                    isActive: true,
                    lastDeliveryAt: "2026-02-18T07:45:00.000Z",
                    lastDeliveryStatus: "success",
                },
            ],
            recentDeliveries: [
                {
                    id: "del-stub-1",
                    flowId: "flow-stub-1",
                    direction: "inbound",
                    status: "success",
                    recordsSent: 42,
                    recordsFailed: 0,
                    durationMs: 2340,
                    errorMessage: null,
                    occurredAt: "2026-02-18T08:00:00.000Z",
                },
            ],
            createdAt: "2026-01-10T10:00:00.000Z",
            updatedAt: "2026-02-18T08:00:00.000Z",
            createdBy: "admin@example.com",
        },
        "int-stub-email": {
            id: "int-stub-email",
            code: "email-service",
            name: "Email Service",
            description: "Transactional email delivery via SMTP relay",
            endpointType: "rest_api",
            baseUrl: "https://mail.example.com/api",
            authMethod: "api_key",
            headers: null,
            timeoutMs: 10_000,
            retryPolicy: { maxAttempts: 2, backoffStrategy: "linear", initialDelayMs: 500 },
            circuitBreaker: null,
            isActive: true,
            flows: [
                {
                    id: "flow-stub-2",
                    code: "send-transactional",
                    name: "Transactional Emails",
                    entityName: "Notification",
                    flowDirection: "outbound",
                    triggerMode: "realtime",
                    scheduleCron: null,
                    syncMode: "full",
                    fieldMappingCount: 5,
                    isActive: true,
                    lastRunAt: "2026-02-18T12:00:00.000Z",
                    lastRunStatus: "success",
                },
            ],
            webhooks: [],
            recentDeliveries: [],
            createdAt: "2026-01-15T10:00:00.000Z",
            updatedAt: null,
            createdBy: "admin@example.com",
        },
    };

    return stubs[id] ?? null;
}

/**
 * GET /api/admin/mesh/integration-studio/:integrationId
 * Returns detailed integration configuration, flows, webhooks, and delivery logs.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { integrationId } = await context.params;

    try {
        const res = await fetch(
            `${auth.runtimeApiUrl}/api/meta/integrations/${encodeURIComponent(integrationId)}`,
            {
                headers: {
                    "X-Correlation-Id": auth.correlationId,
                    "X-Tenant-Id": auth.tenantId,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!res.ok) {
            const stub = getBaselineIntegrationDetail(integrationId);
            if (stub) {
                return NextResponse.json(
                    { success: true, data: stub },
                    { headers: { "X-Correlation-Id": auth.correlationId, "X-Stub-Response": "true" } },
                );
            }
            return NextResponse.json(
                { success: false, error: { code: "UPSTREAM_ERROR", message: `Failed to fetch integration (${res.status})` } },
                { status: res.status >= 500 ? 502 : res.status },
            );
        }

        const data: unknown = await res.json();
        return NextResponse.json(
            { success: true, ...(typeof data === "object" && data !== null ? data : { data }) },
            { headers: { "X-Correlation-Id": auth.correlationId } },
        );
    } catch {
        const stub = getBaselineIntegrationDetail(integrationId);
        if (stub) {
            return NextResponse.json(
                { success: true, data: stub },
                { headers: { "X-Correlation-Id": auth.correlationId, "X-Stub-Response": "true" } },
            );
        }
        return NextResponse.json(
            { success: false, error: { code: "PROXY_ERROR", message: "Failed to connect to upstream" } },
            { status: 502 },
        );
    }
}
