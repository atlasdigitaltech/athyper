/**
 * Saved-views list relay — GET /api/platform/saved-views/:entityCode
 *
 * Lists saved views for the given entity visible to the current principal
 * (own views + shared views for that entity).
 * Response: SavedView[]
 *
 * Proxies to runtime GET /api/platform/saved-views/:entityCode.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entityCode: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityCode } = await params;

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/saved-views/${encodeURIComponent(entityCode)}`,
      { headers: buildRuntimeHeaders(session), cache: "no-store" },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
