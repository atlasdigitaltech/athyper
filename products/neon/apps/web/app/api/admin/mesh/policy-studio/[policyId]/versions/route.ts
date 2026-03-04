import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../../meta-studio/helpers";

import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ policyId: string }>;
}

/**
 * POST /api/admin/mesh/policy-studio/:policyId/versions
 * Creates a new draft version, publishes a version, or archives a version.
 *
 * Body discrimination:
 *   - { action: "create" }  → creates a new draft version
 *   - { action: "publish", versionId: "..." } → publishes a draft version
 *   - { action: "archive", versionId: "..." } → archives a published version
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { policyId } = await context.params;
  const body = (await request.json()) as {
    action?: string;
    versionId?: string;
  };

  const action = body.action ?? "create";

  try {
    let upstreamUrl: string;
    let method = "POST";

    switch (action) {
      case "create":
        upstreamUrl = `${auth.runtimeApiUrl}/api/policies/${encodeURIComponent(policyId)}/versions`;
        break;
      case "publish":
        if (!body.versionId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "MISSING_VERSION_ID",
                message: "versionId required for publish",
              },
            },
            { status: 400 },
          );
        }
        upstreamUrl = `${auth.runtimeApiUrl}/api/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(body.versionId)}/publish`;
        method = "PATCH";
        break;
      case "archive":
        if (!body.versionId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "MISSING_VERSION_ID",
                message: "versionId required for archive",
              },
            },
            { status: 400 },
          );
        }
        upstreamUrl = `${auth.runtimeApiUrl}/api/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(body.versionId)}/archive`;
        method = "PATCH";
        break;
      default:
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_ACTION",
              message: `Unknown action: ${action}`,
            },
          },
          { status: 400 },
        );
    }

    const res = await fetch(upstreamUrl, {
      method,
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
            code: "VERSION_ACTION_FAILED",
            message: `${action} failed (${res.status})`,
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
