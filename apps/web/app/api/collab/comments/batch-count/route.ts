import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/collab/comments/batch-count?entity_type=X&ids=id1,id2,...
 *
 * Returns per-record comment counts for a batch of record IDs.
 * Only counts non-deleted, non-private comments.
 * Enforces server-side hard limit of 100 IDs.
 *
 * Returns: { counts: Record<recordId, { total: number; hasOpen: boolean }> }
 * Records with zero comments are omitted from the result map.
 */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entity_type");
  const idsParam   = searchParams.get("ids");

  if (!entityType || !idsParam) {
    return NextResponse.json(
      { error: "entity_type and ids are required" },
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

  const params = new URLSearchParams({ entity_type: entityType, ids: ids.join(",") });

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/collab/comments/batch-count?${params}`,
      { headers: buildRuntimeHeaders(session), cache: "no-store" },
    );

    if (!res.ok) {
      console.error("[api/collab/comments/batch-count GET] upstream", res.status, { userId: session.userId });
      // Return empty map on upstream failure — rows just show no badges
      return NextResponse.json({ counts: {} });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/collab/comments/batch-count GET]", msg, { userId: session.userId });
    return NextResponse.json({ counts: {} });
  }
}
