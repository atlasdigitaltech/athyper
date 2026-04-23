import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/collab/bookmarks/batch?entity_code=X&ids=id1,id2,...
 *
 * Batch bookmark membership check for the current principal.
 * Returns the subset of requested IDs that are bookmarked.
 * Enforces server-side hard limit of 100 IDs.
 *
 * Returns: { bookmarked_ids: string[] }
 */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const entityCode = searchParams.get("entity_code");
  const idsParam   = searchParams.get("ids");

  if (!entityCode || !idsParam) {
    return NextResponse.json(
      { error: "entity_code and ids are required" },
      { status: 400 },
    );
  }

  const ids = idsParam.split(",").filter(Boolean);
  if (ids.length > 100) {
    return NextResponse.json(
      { error: "MAX_100_IDS", max: 100 },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({ entity_code: entityCode, ids: ids.join(",") });

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/collab/bookmarks/batch?${params}`,
      { headers: buildRuntimeHeaders(session), cache: "no-store" },
    );

    if (!res.ok) {
      console.error("[api/collab/bookmarks/batch GET] upstream", res.status, { userId: session.userId });
      return NextResponse.json({ bookmarked_ids: [] });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/bookmarks/batch GET]", msg, { userId: session.userId });
    return NextResponse.json({ bookmarked_ids: [] });
  }
}
