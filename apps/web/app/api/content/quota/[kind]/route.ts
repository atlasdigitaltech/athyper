import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/** DELETE /api/content/quota/[kind] — remove quota for a specific kind */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { kind } = await params;
    const url = `${RUNTIME_API_URL}/api/content/quota/config/${encodeURIComponent(kind)}`;

    const res  = await fetch(url, { method: "DELETE", headers: buildRuntimeHeaders(session) });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/content/quota/[kind] DELETE]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
