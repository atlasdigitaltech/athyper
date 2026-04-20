import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED = ["scopeType", "scopeId", "fiscalYear", "period", "bookId"] as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ bankAccountId: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { bankAccountId } = await params;
    const qs = forwardSearchParams(req.url, ALLOWED);
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/bank/unreconciled/${encodeURIComponent(bankAccountId)}?${qs}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { items: [], totalUnreconciled: 0, count: 0, asAt: new Date().toISOString() },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/finance/bank/unreconciled/[bankAccountId]]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { items: [], totalUnreconciled: 0, count: 0, asAt: new Date().toISOString() },
      { status: 503 },
    );
  }
}
