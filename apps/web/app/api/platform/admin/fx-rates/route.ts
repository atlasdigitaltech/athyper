/**
 * FX Rate admin create relay — POST /api/platform/admin/fx-rates
 */
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
  headers.set("Content-Type", "application/json");

  try {
    const upstream = await fetch(
      `${RUNTIME_API_URL}/api/platform/admin/fx-rates`,
      { method: "POST", headers, body: await req.text(), cache: "no-store" },
    );
    return new NextResponse(await upstream.arrayBuffer(), {
      status:  upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[relay:admin-fx-rates] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
