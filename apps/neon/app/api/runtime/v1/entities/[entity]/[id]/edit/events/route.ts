import { NextResponse } from "next/server";
import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * The records service owns the durable document event cursor. This endpoint
 * keeps the Neon URL same-origin and proxies the authenticated SSE body. A
 * redirect is unsafe here because it can expose an internal service origin
 * and makes the browser reconnect to a URL outside the BFF session boundary.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to stream document edit events." },
      { status: 401 },
    );
  }
  const { entity, id } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const recordId = id.trim();
  if (!entityCode || !recordId) {
    return NextResponse.json({ error: "INVALID_DOCUMENT_SCOPE" }, { status: 400 });
  }

  const headers = new Headers(buildRuntimeHeaders(session));
  const lastEventId = request.headers.get("last-event-id")
    ?? new URL(request.url).searchParams.get("lastEventId");
  if (lastEventId) headers.set("Last-Event-ID", lastEventId);

  const upstream = await fetch(
    buildRuntimeUrl(runtimeServerPath.documentEventStream(entityCode, recordId)),
    { method: "GET", headers, cache: "no-store", signal: request.signal },
  );
  const responseHeaders = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8",
    "Cache-Control": upstream.headers.get("Cache-Control") ?? "no-cache, no-transform, no-store",
    "X-Accel-Buffering": upstream.headers.get("X-Accel-Buffering") ?? "no",
    Connection: "keep-alive",
  });
  const body = upstream.body ?? new ReadableStream<Uint8Array>();
  return new NextResponse(prependConnectedEvent(body), { status: upstream.status, headers: responseHeaders });
}

function prependConnectedEvent(stream: ReadableStream): ReadableStream<Uint8Array> {
  const connectedChunk = encoder.encode("event: connected\ndata: {\"connected\":true}\n\n");
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(connectedChunk);
      const reader = stream.getReader();
      try {
        while (true) {
          const entry = await reader.read();
          if (entry.done) break;
          controller.enqueue(entry.value);
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
    cancel(reason) {
      stream.cancel(reason);
    },
  });
}

const encoder = new TextEncoder();
