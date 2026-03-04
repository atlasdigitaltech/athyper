import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../../../meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ queue: string; jobId: string }>;
}

/**
 * GET /api/admin/mesh/jobs/queues/:queue/:jobId
 * Returns full job detail including payload, attempts, error stack.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { queue, jobId } = await context.params;

  try {
    const res = await fetch(
      `${auth.runtimeApiUrl}/api/admin/jobs/queues/${encodeURIComponent(queue)}/${encodeURIComponent(jobId)}`,
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
            message: `Failed to fetch job (${res.status})`,
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

/**
 * POST /api/admin/mesh/jobs/queues/:queue/:jobId
 * Job actions: retry, remove.
 *
 * Body: { action: "retry" | "remove" }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { queue, jobId } = await context.params;
  const body = (await request.json()) as { action?: string };

  if (!body.action || !["retry", "remove"].includes(body.action)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_ACTION",
          message: "action must be 'retry' or 'remove'",
        },
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `${auth.runtimeApiUrl}/api/admin/jobs/queues/${encodeURIComponent(queue)}/${encodeURIComponent(jobId)}/${body.action}`,
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
        {
          success: false,
          error: {
            code: "ACTION_FAILED",
            message: `Job ${body.action} failed (${res.status})`,
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
