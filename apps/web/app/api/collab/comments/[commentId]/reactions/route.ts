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
      `${COLLAB_API_URL}/api/collab/comments/${commentId}/reactions`,
      { headers: buildRuntimeHeaders(session), cache: "no-store" },
    );
    if (!res.ok) return NextResponse.json({ ok: true, data: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ ok: true, data: [] });
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
      `${COLLAB_API_URL}/api/collab/comments/${commentId}/reactions`,
      {
        method: "POST",
        headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      console.error("[api/collab/reactions POST] upstream", res.status);
      return NextResponse.json({ error: "Collab service unavailable" }, { status: 503 });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/collab/reactions POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 503 });
  }
}
