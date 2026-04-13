import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jeId: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jeId } = await params;

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/journals/${encodeURIComponent(jeId)}/posting-trace`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "Upstream error" }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    console.error("[api/finance/journals/posting-trace]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
