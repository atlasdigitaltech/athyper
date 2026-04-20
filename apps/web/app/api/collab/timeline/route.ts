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
      if (res.status === 404 || res.status === 410) {
        return NextResponse.json({ ok: true, data: [] });
      }
      console.error("[api/collab/timeline GET] upstream", res.status, { userId: session.userId });
      return NextResponse.json({ error: "Timeline service unavailable" }, { status: 502 });
    }
    const data: unknown = await res.json().catch(() => null);
    if (!data) {
      console.error("[api/collab/timeline GET] invalid JSON from upstream", { userId: session.userId });
      return NextResponse.json({ error: "Timeline service unavailable" }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/timeline GET]", msg, { userId: session.userId });
    return NextResponse.json({ error: "Timeline service unavailable" }, { status: 502 });
  }
}
