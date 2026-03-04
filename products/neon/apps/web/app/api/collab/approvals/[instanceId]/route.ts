import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../../admin/mesh/meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ instanceId: string }>;
}

/**
 * GET /api/collab/approvals/:instanceId
 * Returns approval instance detail with stages, tasks, and current user's pending task.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { instanceId } = await context.params;

  try {
    const res = await fetch(
      `${auth.runtimeApiUrl}/api/collab/approvals/${encodeURIComponent(instanceId)}`,
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
        {
          success: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: `Failed to fetch approval (${res.status})`,
          },
        },
        { status: res.status >= 500 ? 502 : res.status },
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
