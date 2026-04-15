import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED_PARAMS = ["q", "kind", "status", "locale", "limit", "after"] as const;

/**
 * GET /api/content/search
 *
 * BFF proxy for GET /content/search on the runtime.
 * Uses PostgreSQL full-text search (plainto_tsquery + ts_rank).
 * Returns { ok, data: ContentItem[], hasMore, nextCursor, query }
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const qs  = forwardSearchParams(request.url, ALLOWED_PARAMS);
  const url = `${RUNTIME_API_URL}/api/content/search${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, { headers: buildRuntimeHeaders(session), cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "SEARCH_UNAVAILABLE" }, { status: 503 });
  }
}
