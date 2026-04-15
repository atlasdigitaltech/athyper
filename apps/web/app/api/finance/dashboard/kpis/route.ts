import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

const EMPTY_KPI = {
  revenueMtd:   null,
  expensesMtd:  null,
  openAp:       null,
  openAr:       null,
  cashBalance:  null,
  journalCount: null,
  period:       null,
  asAt:         new Date().toISOString(),
};

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/dashboard/kpis`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ ...EMPTY_KPI, asAt: new Date().toISOString() }));
    return NextResponse.json(body, { status: res.ok ? 200 : res.status });
  } catch (e) {
    console.error("[api/finance/dashboard/kpis]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ...EMPTY_KPI, asAt: new Date().toISOString() }, { status: 503 });
  }
}
