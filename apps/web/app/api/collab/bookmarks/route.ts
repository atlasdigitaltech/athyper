import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/collab/bookmarks
 *
 * Returns grouped bookmarks for the current principal.
 * Proxies to GET /api/collab/bookmarks on the runtime backend.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/collab/bookmarks`, {
      headers: buildRuntimeHeaders(session),
      cache:   "no-store",
    });

    if (!res.ok) {
      console.error("[api/collab/bookmarks GET] upstream", res.status, { userId: session.userId });
      return NextResponse.json({ error: "Bookmark list failed" }, { status: res.status });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/bookmarks GET]", msg, { userId: session.userId });
    return NextResponse.json({ error: "Bookmark service unavailable" }, { status: 502 });
  }
}

/**
 * POST /api/collab/bookmarks
 *
 * Toggle a bookmark for the current principal on an entity record.
 * Body: { entity_code: string, record_id: string, display_name?: string, record_code?: string }
 * Returns: { bookmarked: boolean }
 *
 * Proxies to POST /api/collab/bookmarks on the runtime backend.
 * The runtime layer handles upsert-or-delete semantics and RLS.
 */
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/collab/bookmarks`, {
      method:  "POST",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
      },
      body:  JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[api/collab/bookmarks POST] upstream", res.status, { userId: session.userId });
      return NextResponse.json({ error: "Bookmark toggle failed" }, { status: res.status });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/bookmarks POST]", msg, { userId: session.userId });
    return NextResponse.json({ error: "Bookmark service unavailable" }, { status: 502 });
  }
}
