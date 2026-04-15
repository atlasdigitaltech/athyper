import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * PATCH /api/user/saved-views/:id/:action
 *
 * Toggles a management flag on a saved view.
 *
 * Actions:
 *   pin     — toggle is_pinned (sidebar shortcut)
 *   star    — toggle metadata.is_starred (personal favourite)
 *   share   — toggle scope between personal ↔ shared
 *   archive — set status = 'archived' (removes from all lists)
 *
 * Returns: { ok: true }
 *
 * Proxies to runtime PATCH /api/user/saved-views/:viewId/:action.
 */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action } = await params;

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/user/saved-views/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      {
        method: "PATCH",
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 503 });
  }
}
