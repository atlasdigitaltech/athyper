import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED_PARAMS = ["entity_type", "module_id", "is_active", "limit", "offset"] as const;

/**
 * GET /api/policy/definitions
 * BFF proxy — list policy definitions for the tenant.
 *
 * POST /api/policy/definitions
 * BFF proxy — create a new policy definition.
 */

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const qs = forwardSearchParams(request.url, ALLOWED_PARAMS);
  const url = `${RUNTIME_API_URL}/api/policy/definitions${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ items: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const res = await fetch(`${RUNTIME_API_URL}/api/policy/definitions`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
