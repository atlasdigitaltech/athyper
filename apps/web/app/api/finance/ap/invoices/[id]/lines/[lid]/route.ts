import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type RouteContext = { params: Promise<{ id: string; lid: string }> };

export async function PATCH(
  req: Request,
  { params }: RouteContext,
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, lid } = await params;
    const body = await req.json() as Record<string, unknown>;
    const res = await fetch(
      `${RUNTIME_API_URL}/api/finance/ap/invoices/${encodeURIComponent(id)}/lines/${encodeURIComponent(lid)}`,
      {
        method: "PATCH",
        headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/ap/invoices/[id]/lines/[lid] PATCH]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: RouteContext,
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, lid } = await params;
    const res = await fetch(
      `${RUNTIME_API_URL}/api/finance/ap/invoices/${encodeURIComponent(id)}/lines/${encodeURIComponent(lid)}`,
      {
        method: "DELETE",
        headers: buildRuntimeHeaders(session),
      },
    );
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/ap/invoices/[id]/lines/[lid] DELETE]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
