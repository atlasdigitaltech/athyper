/**
 * FX Rate list relay — GET /api/platform/ref/fx-rates
 * Proxies to runtime GET /api/platform/ref/fx-rates with search params forwarded.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = req.nextUrl.search;
  try {
    const upstream = await fetch(
      `${RUNTIME_API_URL}/api/platform/ref/fx-rates${search}`,
      { headers: buildRuntimeHeaders(session), cache: "no-store" },
    );
    return new NextResponse(await upstream.arrayBuffer(), {
      status:  upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[relay:fx-rates] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
