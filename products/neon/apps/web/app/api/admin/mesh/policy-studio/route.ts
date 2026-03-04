import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../meta-studio/helpers";

/**
 * GET /api/admin/mesh/policy-studio
 * Lists all policies.
 */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const res = await fetch(`${auth.runtimeApiUrl}/api/policies`, {
      headers: {
        "X-Correlation-Id": auth.correlationId,
        "X-Tenant-Id": auth.tenantId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: true, data: [] },
        {
          headers: {
            "X-Correlation-Id": auth.correlationId,
            "X-Stub-Response": "true",
          },
        },
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
  } catch {
    return NextResponse.json(
      { success: true, data: [] },
      {
        headers: {
          "X-Correlation-Id": auth.correlationId,
          "X-Stub-Response": "true",
        },
      },
    );
  }
}
