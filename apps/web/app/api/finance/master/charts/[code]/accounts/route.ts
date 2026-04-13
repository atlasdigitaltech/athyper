import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type Params = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await params;
  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/finance/master/charts/${encodeURIComponent(code)}/accounts`,
      { headers: buildRuntimeHeaders(session), cache: "no-store" },
    );
    if (!res.ok) return NextResponse.json([], { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error("[api/finance/master/charts/accounts]", e instanceof Error ? e.message : e);
    return NextResponse.json([], { status: 503 });
  }
}
