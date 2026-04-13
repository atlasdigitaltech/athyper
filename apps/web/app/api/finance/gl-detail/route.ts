import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED = ["scopeType", "scopeId", "fiscalYear", "period", "bookId", "currency", "comparative", "accountCode"] as const;

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const qs = forwardSearchParams(req.url, ALLOWED);
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/gl-detail?${qs}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "Upstream error" }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    console.error("[api/finance/gl-detail]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
