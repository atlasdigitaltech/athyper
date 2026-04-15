import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

/**
 * POST /api/collab/comments/mark-all-read?entityType=&entityId=
 *
 * Static route — must be listed here (not under [commentId]) so Next.js
 * resolves it before the dynamic segment.
 * Upserts the comment_feed_cursor to now() for the calling principal.
 */

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = forwardSearchParams(req.url, ["entityType", "entityId"]);

  try {
    const res = await fetch(
      `${COLLAB_API_URL}/api/collab/comments/mark-all-read?${params}`,
      {
        method: "POST",
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      console.error("[api/collab/mark-all-read POST] upstream", res.status);
      return NextResponse.json({ error: "Collab service unavailable" }, { status: 503 });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/collab/mark-all-read POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 503 });
  }
}
