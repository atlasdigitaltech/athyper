import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/workflow/requests/[id]
 *
 * BFF proxy — returns full approval context:
 * { request, stages, workItems, behaviors }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/workflow/requests/${id}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (res.status === 404) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "UPSTREAM_ERROR" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
