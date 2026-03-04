import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../../meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ policyId: string }>;
}

/**
 * POST /api/admin/mesh/policy-studio/:policyId/compile
 * Triggers recompilation of the policy's current version.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { policyId } = await context.params;

  try {
    const res = await fetch(
      `${auth.runtimeApiUrl}/api/policies/${encodeURIComponent(policyId)}/compile`,
      {
        method: "POST",
        headers: {
          "X-Correlation-Id": auth.correlationId,
          "X-Tenant-Id": auth.tenantId,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "COMPILE_FAILED",
            message: `Compilation failed (${res.status})`,
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
