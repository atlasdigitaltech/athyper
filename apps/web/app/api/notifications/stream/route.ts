import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/notifications/stream
 *
 * BFF proxy for the notification SSE stream.
 * Pipes the backend Server-Sent Events stream to the browser using
 * Next.js streaming response support.
 *
 * The browser connects here; this handler forwards the SSE connection to
 * the runtime's /api/platform/notifications/stream endpoint, injecting
 * the server-side session token and tenant headers.
 *
 * On auth failure or backend unavailability the connection is closed
 * immediately so the client's reconnect logic takes over.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstreamUrl = `${RUNTIME_API_URL}/api/platform/notifications/stream`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        ...buildRuntimeHeaders(session),
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      // @ts-expect-error — Next.js fetch supports duplex for streaming
      duplex: "half",
      signal: req.signal,
    });
  } catch {
    // Backend unavailable — return empty 503 so the client retries
    return new NextResponse(null, { status: 503 });
  }

  if (!upstream.ok || !upstream.body) {
    return new NextResponse(null, { status: upstream.status });
  }

  // Pipe the upstream SSE stream directly to the browser.
  // TextDecoderStream / TextEncoderStream ensure proper UTF-8 handling.
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
