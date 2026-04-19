import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

/**
 * GET /api/search
 *
 * BFF proxy for GET /api/search on the runtime (cross-entity Meilisearch).
 * The runtime enforces tenant isolation via a JWT tenant token embedded in
 * the search call — this BFF only forwards allowlisted params and the
 * standard runtime headers (Bearer + X-Org + X-Realm).
 *
 * Response shape:
 *   { hits, total, page, page_size, processing_ms }
 *
 * Returns 503 when the runtime is unreachable. 503 from the runtime itself
 * means Meilisearch is not configured — surface it unchanged so the UI can
 * show "search unavailable".
 */
const ALLOWED_PARAMS = ["q", "entity_type", "page", "page_size", "sort"] as const;

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const qs  = forwardSearchParams(request.url, ALLOWED_PARAMS);
  const url = `${RUNTIME_API_URL}/api/search${qs ? `?${qs}` : ""}`;

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
