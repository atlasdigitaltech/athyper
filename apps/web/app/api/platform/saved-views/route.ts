/**
 * Saved-views create relay — POST /api/platform/saved-views
 *
 * Creates a new saved view for the current principal.
 * Body: { entity_code, name, is_default?, is_shared?, config: EntityListQueryState }
 * Response: SavedView
 *
 * Proxies to runtime POST /api/platform/saved-views.
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
    const upstream = await fetch(`${RUNTIME_API_URL}/api/platform/saved-views`, {
      method: "POST",
      headers,
      body: await req.text(),
      cache: "no-store",
    });
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[relay:platform-saved-views] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
