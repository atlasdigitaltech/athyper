/**
 * Saved-view update relay — PATCH /api/platform/saved-views/:entityCode/:viewId
 *
 * Updates the config (state_json) and optionally the name of an existing saved view.
 * Body: { config: EntityListQueryState, name?: string }
 * Response: SavedView
 *
 * Proxies to runtime PATCH /api/platform/saved-views/:entity/:viewId.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entityCode: string; viewId: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityCode, viewId } = await params;

  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
  headers.set("Content-Type", "application/json");

  try {
    const upstream = await fetch(
      `${RUNTIME_API_URL}/api/platform/saved-views/${encodeURIComponent(entityCode)}/${encodeURIComponent(viewId)}`,
      { method: "PATCH", headers, body: await req.text(), cache: "no-store" },
    );
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[relay:platform-saved-view-update] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}
