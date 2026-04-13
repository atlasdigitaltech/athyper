import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const qs = forwardSearchParams(req.url, ["companyCode"]);
  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/master/controls?${qs}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json([], { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/finance/master/controls]", e instanceof Error ? e.message : e);
    return NextResponse.json([], { status: 503 });
  }
}
