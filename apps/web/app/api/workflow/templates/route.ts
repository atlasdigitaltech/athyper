import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED_PARAMS = ["is_active", "limit", "offset"] as const;

/** GET /api/workflow/templates — list all workflow templates */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const qs  = forwardSearchParams(request.url, ALLOWED_PARAMS);
  const url = `${RUNTIME_API_URL}/api/workflow/templates${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, { headers: buildRuntimeHeaders(session), cache: "no-store" });
    if (!res.ok) return NextResponse.json({ items: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ items: [] });
  }
}

/** POST /api/workflow/templates — create a new template with stages and rules */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const url  = `${RUNTIME_API_URL}/api/workflow/templates`;

    const res = await fetch(url, {
      method:  "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/workflow/templates POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
