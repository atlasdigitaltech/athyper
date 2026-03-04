import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../meta-studio/helpers";

function getBaselineIntegrations() {
  return [
    {
      id: "int-stub-erp",
      code: "erp-sync",
      name: "ERP Sync",
      description: "Synchronize master data with ERP system",
      endpointType: "rest",
      baseUrl: "https://erp.example.com/api/v2",
      authMethod: "oauth2",
      isActive: true,
      flowCount: 3,
      webhookCount: 1,
      lastSyncAt: "2026-02-18T08:00:00.000Z",
      lastSyncStatus: "success",
      createdAt: "2026-01-10T10:00:00.000Z",
      updatedAt: "2026-02-18T08:00:00.000Z",
    },
    {
      id: "int-stub-email",
      code: "email-service",
      name: "Email Service",
      description: "Transactional email delivery via SMTP relay",
      endpointType: "rest",
      baseUrl: "https://mail.example.com/api",
      authMethod: "api_key",
      isActive: true,
      flowCount: 1,
      webhookCount: 0,
      lastSyncAt: null,
      lastSyncStatus: null,
      createdAt: "2026-01-15T10:00:00.000Z",
      updatedAt: null,
    },
  ];
}

/**
 * GET /api/admin/mesh/integration-studio
 * Lists all integration definitions.
 */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const res = await fetch(`${auth.runtimeApiUrl}/api/meta/integrations`, {
      headers: {
        "X-Correlation-Id": auth.correlationId,
        "X-Tenant-Id": auth.tenantId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: true, data: getBaselineIntegrations() },
        {
          headers: {
            "X-Correlation-Id": auth.correlationId,
            "X-Stub-Response": "true",
          },
        },
      );
    }

    const data: unknown = await res.json();
    return NextResponse.json(
      {
        success: true,
        ...(typeof data === "object" && data !== null ? data : { data }),
      },
      { headers: { "X-Correlation-Id": auth.correlationId } },
    );
  } catch {
    return NextResponse.json(
      { success: true, data: getBaselineIntegrations() },
      {
        headers: {
          "X-Correlation-Id": auth.correlationId,
          "X-Stub-Response": "true",
        },
      },
    );
  }
}
