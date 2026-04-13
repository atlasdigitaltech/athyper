import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED_PARAMS = ["limit"] as const;

/**
 * GET /api/workflow/requests/[id]/activity
 *
 * BFF proxy — returns the workflow event log for a request.
 * { items: WorkflowEvent[] }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const qs = forwardSearchParams(request.url, ALLOWED_PARAMS);
  const url = `${RUNTIME_API_URL}/api/workflow/requests/${id}/activity${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ items: [] });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ items: [] });
  }
}
