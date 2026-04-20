import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

/**
 * GET    /api/collab/drafts?entityType=&entityId=&parentCommentId=  — load draft
 * POST   /api/collab/drafts                                          — upsert draft
 * DELETE /api/collab/drafts?entityType=&entityId=&parentCommentId=  — discard draft
 */

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = forwardSearchParams(req.url, ["entityType", "entityId", "parentCommentId"]);

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/drafts?${params}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ ok: true, draft: null });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ ok: true, draft: null });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/drafts`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[api/collab/drafts POST] upstream", res.status);
      return NextResponse.json({ error: "Draft service unavailable" }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/collab/drafts POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Draft service unavailable" }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = forwardSearchParams(req.url, ["entityType", "entityId", "parentCommentId"]);

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/drafts?${params}`, {
      method: "DELETE",
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    if (!res.ok) return NextResponse.json({ error: "Draft service unavailable" }, { status: 503 });
    return NextResponse.json(await res.json());
  } catch {
    return new NextResponse(null, { status: 204 }); // Best-effort — swallow errors
  }
}
