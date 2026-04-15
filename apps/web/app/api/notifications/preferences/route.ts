import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET  /api/notifications/preferences  — user notification preference list
 * PATCH /api/notifications/preferences  — upsert preferences array
 *
 * Proxies to the runtime /api/notifications/preferences endpoint.
 * Authenticated via server-side session; tenant resolved from session headers.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/notifications/preferences`,
      { headers: buildRuntimeHeaders(session), cache: "no-store" },
    );
    if (!res.ok) return NextResponse.json({ data: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/notifications/preferences`,
      {
        method:  "PATCH",
        headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        cache:   "no-store",
      },
    );
    const text = await res.text();
    return new NextResponse(text, {
      status:  res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 503 });
  }
}
