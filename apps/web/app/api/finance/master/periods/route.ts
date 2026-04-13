import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED_PARAMS = ["companyCode", "fiscalYear"] as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const qs = forwardSearchParams(req.url, ALLOWED_PARAMS);
    const url = `${RUNTIME_API_URL}/api/finance/master/periods${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json([], { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/finance/master/periods]", e instanceof Error ? e.message : e);
    return NextResponse.json([], { status: 503 });
  }
}
