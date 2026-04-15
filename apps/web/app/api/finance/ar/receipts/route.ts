import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED = ["scopeType", "scopeId", "fiscalYear", "period", "bookId", "limit", "offset"] as const;

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const qs = forwardSearchParams(req.url, ALLOWED);
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/ar/receipts?${qs}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ items: [], total: 0 }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/finance/ar/receipts]", e instanceof Error ? e.message : e);
    return NextResponse.json({ items: [], total: 0 }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = await req.json();
    // Forward scope params so the backend can resolve company_code_id
    const qs = forwardSearchParams(req.url, ALLOWED);
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/ar/receipts?${qs}`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    console.error("[api/finance/ar/receipts POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
