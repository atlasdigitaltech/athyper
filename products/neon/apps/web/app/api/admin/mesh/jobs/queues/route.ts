import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../meta-studio/helpers";

/**
 * GET /api/admin/mesh/jobs/queues
 * Returns all job queues with aggregate metrics.
 */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  // If no runtime API is configured, return empty queues gracefully
  if (!auth.runtimeApiUrl) {
    return NextResponse.json(
      { success: true, data: [] },
      { headers: { "X-Correlation-Id": auth.correlationId } },
    );
  }

  try {
    const res = await fetch(`${auth.runtimeApiUrl}/api/admin/jobs/queues`, {
      headers: {
        "X-Correlation-Id": auth.correlationId,
        "X-Tenant-Id": auth.tenantId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // If the upstream doesn't support the jobs endpoint, return empty data
      if (res.status === 404) {
        return NextResponse.json(
          { success: true, data: [] },
          { headers: { "X-Correlation-Id": auth.correlationId } },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: `Failed to fetch queues (${res.status})`,
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
