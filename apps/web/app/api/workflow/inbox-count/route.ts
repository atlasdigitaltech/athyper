import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/workflow/inbox-count
 *
 * BFF proxy — returns { count: number } for the current user's pending
 * workflow inbox items. Used by HomeKpiRow for the dashboard KPI tile.
 *
 * Always returns 200 with a fallback of 0 when the upstream is unavailable or
 * the entity context is not yet set (first load race) so the KPI tile renders
 * cleanly rather than flashing a network error.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/workflow/inbox/count`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ count: 0 });
    const data = (await res.json()) as { count: number };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
