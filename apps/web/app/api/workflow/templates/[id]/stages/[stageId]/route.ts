import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type Params = { params: Promise<{ id: string; stageId: string }> };

/** PUT /api/workflow/templates/[id]/stages/[stageId] */
export async function PUT(request: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, stageId } = await params;
    const body = await request.json();
    const url  = `${RUNTIME_API_URL}/api/workflow/templates/${id}/stages/${stageId}`;

    const res  = await fetch(url, {
      method:  "PUT",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/workflow/templates/[id]/stages/[stageId] PUT]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

/** DELETE /api/workflow/templates/[id]/stages/[stageId] */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, stageId } = await params;
    const url = `${RUNTIME_API_URL}/api/workflow/templates/${id}/stages/${stageId}`;

    const res  = await fetch(url, { method: "DELETE", headers: buildRuntimeHeaders(session) });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/workflow/templates/[id]/stages/[stageId] DELETE]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
