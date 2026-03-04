import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../meta-studio/helpers";

import type { NextRequest } from "next/server";

function getBaselineLifecycles() {
  return [
    {
      id: "lc-stub-standard",
      name: "Standard",
      states: ["draft", "active", "archived"],
      transitions: [],
      createdAt: "2026-01-15T10:00:00.000Z",
    },
    {
      id: "lc-stub-approval",
      name: "With Approval",
      states: ["draft", "pending_approval", "approved", "active", "archived"],
      transitions: [],
      createdAt: "2026-01-20T10:00:00.000Z",
    },
  ];
}

/**
 * GET /api/admin/mesh/lifecycle
 * Lists all lifecycle templates.
 */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const res = await fetch(`${auth.runtimeApiUrl}/api/meta/lifecycles`, {
      headers: {
        "X-Correlation-Id": auth.correlationId,
        "X-Tenant-Id": auth.tenantId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: true, data: getBaselineLifecycles() },
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
      { success: true, data: getBaselineLifecycles() },
      {
        headers: {
          "X-Correlation-Id": auth.correlationId,
          "X-Stub-Response": "true",
        },
      },
    );
  }
}

/**
 * POST /api/admin/mesh/lifecycle
 * Creates a new lifecycle template.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body: unknown = await request.json();

  try {
    const res = await fetch(`${auth.runtimeApiUrl}/api/meta/lifecycles`, {
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
        {
          success: false,
          error: {
            code: "CREATE_FAILED",
            message: `Failed to create lifecycle (${res.status})`,
          },
        },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    return NextResponse.json(
      {
        success: true,
        ...(typeof data === "object" && data !== null ? data : { data }),
      },
      { headers: { "X-Correlation-Id": auth.correlationId } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "PROXY_ERROR", message: String(error) },
      },
      { status: 502 },
    );
  }
}
