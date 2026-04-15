import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED = ["scopeType", "scopeId", "fiscalYear", "period", "bookId", "accountCode"] as const;

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const qs = forwardSearchParams(req.url, ALLOWED);
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/account-analysis?${qs}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json(null, { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/finance/account-analysis]", e instanceof Error ? e.message : e);
    return NextResponse.json(null, { status: 503 });
  }
}
