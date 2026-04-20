import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET  /api/collab/comments/:commentId/reactions  — list reactions with emoji + counts
 * POST /api/collab/comments/:commentId/reactions  — toggle reaction (add / remove)
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(
      `${COLLAB_API_URL}/api/collab/comments/${encodeURIComponent(commentId)}/reactions`,
      { headers: buildRuntimeHeaders(session), cache: "no-store" },
    );
    if (!res.ok) {
      if (res.status === 404 || res.status === 410) return NextResponse.json({ ok: true, data: [] });
      console.error("[api/collab/reactions GET] upstream", res.status, { userId: session.userId });
      return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
    }
    const data: unknown = await res.json().catch(() => null);
    return NextResponse.json(data ?? { ok: true, data: [] });
  } catch (e) {
    console.error("[api/collab/reactions GET]", e instanceof Error ? e.message : e, { userId: session.userId });
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${COLLAB_API_URL}/api/collab/comments/${encodeURIComponent(commentId)}/reactions`,
      {
        method: "POST",
        headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      console.error("[api/collab/reactions POST] upstream", res.status, { userId: session.userId });
      return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/collab/reactions POST]", e instanceof Error ? e.message : e, { userId: session.userId });
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
  }
}
