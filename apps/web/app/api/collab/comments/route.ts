import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

/**
 * GET /api/collab/comments?entityType=&entityId=&limit=&offset=
 * POST /api/collab/comments
 *
 * BFF proxy — forwards to the collab service with Bearer auth.
 */

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId are required" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({ entityType, entityId });
  const paging = forwardSearchParams(req.url, ["limit", "offset"]);
  if (paging) new URLSearchParams(paging).forEach((v, k) => params.set(k, v));

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/comments?${params}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) {
      // 404/410 means the entity was deleted or never had comments — show empty list.
      // Any other non-2xx is a real error; surface it so the UI can show a banner.
      if (res.status === 404 || res.status === 410) {
        return NextResponse.json({ ok: true, data: [], hasMore: false });
      }
      console.error("[api/collab/comments GET] upstream", res.status, { userId: session.userId });
      return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
    }
    const data: unknown = await res.json().catch(() => null);
    if (!data) {
      console.error("[api/collab/comments GET] invalid JSON from upstream", { userId: session.userId });
      return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/comments GET]", msg, { userId: session.userId });
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
  }
}

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
    const res = await fetch(`${COLLAB_API_URL}/api/collab/comments`, {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[api/collab/comments POST] upstream returned", res.status, { userId: session.userId });
      return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
    }
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/comments POST]", msg, { userId: session.userId });
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
  }
}
