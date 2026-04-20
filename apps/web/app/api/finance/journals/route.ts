import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED = [
  "scopeType", "scopeId", "fiscalYear", "period", "bookId",
  "status", "source_doc_type", "search", "limit", "offset",
] as const;

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const qs = forwardSearchParams(req.url, ALLOWED);
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/journals?${qs}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "Upstream error" }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    console.error("[api/finance/journals GET]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = await req.json();
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/journals`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "Upstream error" }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    console.error("[api/finance/journals POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 502 });
  }
}
