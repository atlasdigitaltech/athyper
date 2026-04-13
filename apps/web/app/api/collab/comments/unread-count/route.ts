import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

/**
 * GET /api/collab/comments/unread-count?entityType=&entityId=
 *
 * Static route — must live here so Next.js resolves it before [commentId].
 * Falls back to { ok: true, count: 0 } when the collab service is unavailable.
 */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = forwardSearchParams(req.url, ["entityType", "entityId"]);

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/comments/unread-count?${params}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ ok: true, count: 0 });
    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ok: true, count: 0 });
  }
}
