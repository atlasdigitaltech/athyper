import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/** POST /api/workflow/templates/[id]/compile — recompile compiled_json + compiled_hash */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const url    = `${RUNTIME_API_URL}/api/workflow/templates/${id}/compile`;

    const res = await fetch(url, {
      method:  "POST",
      headers: buildRuntimeHeaders(session),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/workflow/templates/[id]/compile POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
