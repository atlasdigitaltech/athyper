import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED_PARAMS = ["entityType", "entityId"] as const;

/**
 * GET /api/collab/activity/stream
 *
 * BFF SSE proxy for GET /collab/activity/stream on the runtime.
 * Streams live activity events (comments, reactions, counts) for an entity.
 *
 * Events forwarded to the client:
 *   activity:comment  — new comment or reply
 *   activity:reaction — reaction toggled
 *   activity:count    — updated comment count
 *   :heartbeat        — keep-alive comment
 *
 * Usage (browser):
 *   const url = `/api/collab/activity/stream?entityType=...&entityId=...`;
 *   const es  = new EventSource(url);
 *   es.addEventListener("activity:comment", (e) => { ... });
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const qs  = forwardSearchParams(request.url, ALLOWED_PARAMS);
  const url = `${RUNTIME_API_URL}/api/collab/activity/stream${qs ? `?${qs}` : ""}`;

  // Proxy the SSE stream. Next.js App Router supports streaming via ReadableStream.
  const upstream = await fetch(url, {
    headers: {
      ...buildRuntimeHeaders(session),
      Accept: "text/event-stream",
    },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Stream unavailable", { status: 503 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Required for SSE streaming in Next.js App Router
export const dynamic = "force-dynamic";
