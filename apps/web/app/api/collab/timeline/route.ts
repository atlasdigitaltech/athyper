import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

/**
 * GET /api/collab/timeline?entityType=&entityId=&limit=&offset=
 *
 * Unified activity timeline — field changes, status transitions, comments,
 * workflow events — for a given entity record.
 */

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const qs = forwardSearchParams(req.url, ["entityType", "entityId", "actorUserId", "startDate", "endDate", "limit", "offset"]);

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/timeline?${qs}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) {
      // Backend not available — return empty timeline so UI shows "No activity".
      return NextResponse.json({ ok: true, data: [] });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/timeline GET]", msg);
    return NextResponse.json({ ok: true, data: [] });
  }
}
