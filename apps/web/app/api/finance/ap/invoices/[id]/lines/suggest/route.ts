import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  req: Request,
  { params }: RouteContext,
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ suggestions: [] }, { status: 401 });

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    if (!q.trim()) return NextResponse.json({ suggestions: [] });

    const res = await fetch(
      `${RUNTIME_API_URL}/api/finance/ap/invoices/${encodeURIComponent(id)}/lines/suggest?q=${encodeURIComponent(q)}`,
      { headers: buildRuntimeHeaders(session) },
    );
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/ap/invoices/[id]/lines/suggest GET]", e instanceof Error ? e.message : e);
    return NextResponse.json({ suggestions: [] }, { status: 503 });
  }
}
