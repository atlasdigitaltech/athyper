import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type RouteContext = { params: Promise<{ id: string; lid: string }> };

export async function POST(
  req: Request,
  { params }: RouteContext,
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, lid } = await params;
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "save";

    const res = await fetch(
      `${RUNTIME_API_URL}/api/finance/ap/invoices/${encodeURIComponent(id)}/lines/${encodeURIComponent(lid)}/classify?mode=${mode}`,
      {
        method: "POST",
        headers: buildRuntimeHeaders(session),
      },
    );
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/ap/invoices/[id]/lines/[lid]/classify POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
