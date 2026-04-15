import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/user/saved-views
 *
 * Lists all saved views belonging to the current user (across all entities).
 * Includes personal views owned by the principal, plus shared/system views.
 *
 * Response: SavedView[]
 *   { id, name, description, view_type, module_code,
 *     is_pinned, is_starred, is_shared, is_archived,
 *     created_at, updated_at }
 *
 * Proxies to runtime GET /api/user/saved-views.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/user/saved-views`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
