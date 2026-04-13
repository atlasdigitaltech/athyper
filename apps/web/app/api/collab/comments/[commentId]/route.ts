import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * PATCH /api/collab/comments/[commentId]
 * DELETE /api/collab/comments/[commentId]
 */

type Params = Promise<{ commentId: string }>;

export async function PATCH(req: Request, { params }: { params: Params }) {
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
    const res = await fetch(`${COLLAB_API_URL}/api/collab/comments/${commentId}`, {
      method: "PATCH",
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
    console.error("[api/collab/comments/[commentId] PATCH]", msg);
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { commentId } = await params;

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/comments/${commentId}`, {
      method: "DELETE",
      headers: buildRuntimeHeaders(session),
    });
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/comments/[commentId] DELETE]", msg);
    return NextResponse.json({ error: "Collab service unavailable" }, { status: 503 });
  }
}
