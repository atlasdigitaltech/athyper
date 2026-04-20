import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * PUT    /api/policy/rules/[ruleId]  — update a rule
 * DELETE /api/policy/rules/[ruleId]  — remove a rule
 */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ruleId } = await params;

  try {
    const body = await request.json();
    const res = await fetch(`${RUNTIME_API_URL}/api/policy/rules/${encodeURIComponent(ruleId)}`, {
      method: "PUT",
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ruleId } = await params;

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/policy/rules/${encodeURIComponent(ruleId)}`, {
      method: "DELETE",
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
