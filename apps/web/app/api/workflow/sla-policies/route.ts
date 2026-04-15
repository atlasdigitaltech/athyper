import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/** GET /api/workflow/sla-policies — list all SLA policies */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = `${RUNTIME_API_URL}/api/workflow/sla-policies`;
  try {
    const res = await fetch(url, { headers: buildRuntimeHeaders(session), cache: "no-store" });
    if (!res.ok) return NextResponse.json({ items: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ items: [] });
  }
}

/** POST /api/workflow/sla-policies — create a new SLA policy */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const url  = `${RUNTIME_API_URL}/api/workflow/sla-policies`;

    const res = await fetch(url, {
      method:  "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/workflow/sla-policies POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
