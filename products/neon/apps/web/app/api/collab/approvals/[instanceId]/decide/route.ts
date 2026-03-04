import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../../../admin/mesh/meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ instanceId: string }>;
}

/**
 * POST /api/collab/approvals/:instanceId/decide
 * Submit an approve/reject decision with a note.
 *
 * Body: { decision: "approve" | "reject", note?: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { instanceId } = await context.params;
  const body = (await request.json()) as { decision?: string; note?: string };

  if (!body.decision || !["approve", "reject"].includes(body.decision)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_DECISION",
          message: "decision must be 'approve' or 'reject'",
        },
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `${auth.runtimeApiUrl}/api/collab/approvals/${encodeURIComponent(instanceId)}/decide`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-Id": auth.correlationId,
          "X-Tenant-Id": auth.tenantId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DECIDE_FAILED",
            message: `Decision failed (${res.status})`,
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
