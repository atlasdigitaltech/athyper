import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type Params = { params: Promise<{ id: string; stageId: string }> };

/** POST /api/workflow/templates/[id]/stages/[stageId]/rules — add a rule to a stage */
export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, stageId } = await params;
    const body = await request.json();
    const url  = `${RUNTIME_API_URL}/api/workflow/templates/${encodeURIComponent(id)}/stages/${encodeURIComponent(stageId)}/rules`;

    const res  = await fetch(url, {
      method:  "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/workflow/templates/[id]/stages/[stageId]/rules POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
