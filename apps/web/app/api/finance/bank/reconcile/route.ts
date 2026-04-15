import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as unknown;
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/bank/reconcile`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json() as unknown;
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/finance/bank/reconcile]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
