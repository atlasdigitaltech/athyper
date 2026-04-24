import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const SCOPE_PARAMS = ["scopeType", "scopeId", "fiscalYear", "period", "bookId", "currency"];
const INVOICE_PARAMS = [...SCOPE_PARAMS, "status", "supplierId", "limit", "offset"] as const;

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const qs = forwardSearchParams(req.url, INVOICE_PARAMS);
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/ap/invoices?${qs}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ items: [], total: 0 }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/finance/ap/invoices]", e instanceof Error ? e.message : e);
    return NextResponse.json({ items: [], total: 0 }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as Record<string, unknown>;
    const idempotencyKey = req.headers.get("X-Idempotency-Key");
    if (idempotencyKey) body["idempotency_key"] = idempotencyKey;

    const res = await fetch(`${RUNTIME_API_URL}/api/finance/ap/invoices`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/ap/invoices POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
