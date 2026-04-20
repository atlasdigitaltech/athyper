import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

/**
 * GET /api/collab/comments/[commentId]/replies?limit=&offset=
 * POST /api/collab/comments/[commentId]/replies
 */

type Params = Promise<{ commentId: string }>;

export async function GET(req: Request, { params }: { params: Params }) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { commentId } = await params;
  const qs = forwardSearchParams(req.url, ["limit", "offset"]);
  const url = `${COLLAB_API_URL}/api/collab/comments/${encodeURIComponent(commentId)}/replies${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/comments/[commentId]/replies GET]", msg);
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: { params: Params }) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { commentId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/comments/${encodeURIComponent(commentId)}/replies`, {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Collab service error" }, { status: res.status });
    }
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/comments/[commentId]/replies POST]", msg);
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 502 });
  }
}
