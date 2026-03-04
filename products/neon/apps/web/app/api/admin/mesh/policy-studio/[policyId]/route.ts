import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ policyId: string }>;
}

/**
 * GET /api/admin/mesh/policy-studio/:policyId
 * Returns policy detail with versions, rules, and compiled data.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { policyId } = await context.params;

  try {
    const res = await fetch(
      `${auth.runtimeApiUrl}/api/policies/${encodeURIComponent(policyId)}`,
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
            message: `Failed to fetch policy (${res.status})`,
          },
        },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const data: unknown = await res.json();
    const etag = res.headers.get("etag");

    return NextResponse.json(
      {
        success: true,
        ...(typeof data === "object" && data !== null ? data : { data }),
      },
      {
        headers: {
          "X-Correlation-Id": auth.correlationId,
          ...(etag ? { ETag: etag } : {}),
        },
      },
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

/**
 * DELETE /api/admin/mesh/policy-studio/:policyId
 * Deletes a policy and all its versions/rules.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { policyId } = await context.params;

  try {
    const res = await fetch(
      `${auth.runtimeApiUrl}/api/policies/${encodeURIComponent(policyId)}`,
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
        {
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: `Failed to delete policy (${res.status})`,
          },
        },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    return NextResponse.json(
      { success: true },
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
