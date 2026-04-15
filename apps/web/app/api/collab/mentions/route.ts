import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { COLLAB_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

/**
 * GET /api/collab/mentions?q=<query>
 *
 * Principal autocomplete for @-mention in CommentForm / MentionInput.
 * Returns up to 10 matching active principals: { id, username, displayName }
 */

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = forwardSearchParams(req.url, ["q"]);

  try {
    const res = await fetch(`${COLLAB_API_URL}/api/collab/mentions?${params}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ ok: true, data: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ ok: true, data: [] });
  }
}
