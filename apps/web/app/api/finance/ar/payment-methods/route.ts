import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/ar/payment-methods`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ items: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/finance/ar/payment-methods]", e instanceof Error ? e.message : e);
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
