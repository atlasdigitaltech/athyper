import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import {
  RUNTIME_API_URL,
  buildServiceUrl,
  buildRuntimeHeaders,
  copySetCookieHeaders,
  copyTraceResponseHeaders,
  safePathFromSegments,
  sanitizeContentDisposition,
  withTraceResponseHeaders,
} from "@/lib/server/runtime-headers";

/**
 * GET /api/relay/[...path]
 * POST /api/relay/[...path]
 * PUT /api/relay/[...path]
 * PATCH /api/relay/[...path]
 * DELETE /api/relay/[...path]
 *
 * Wildcard BFF proxy — forwards requests to RUNTIME_API_URL with
 * Bearer auth + tenant context injected from the Redis session.
 *
 * Client-side code never touches tokens directly; it calls /api/relay/*
 * and the BFF handles all auth concerns.
 */

type Params = { params: Promise<{ path: string[] }> };

const UPSTREAM_TIMEOUT_MS = 30_000;

const PASSTHROUGH_REQUEST_HEADERS = [
  "Idempotency-Key",
  "X-Idempotency-Key",
] as const;

function buildUpstreamPath(path: string[]): string | null {
  const safePath = safePathFromSegments(path);
  if (!safePath) return null;
  // Callers that use relayFetch() pass paths without the /api/ prefix (e.g. "/audit/events").
  // Callers that build the URL manually may already include it (e.g. "/api/relay/api/records/...").
  return safePath.startsWith("api/") ? `/${safePath}` : `/api/${safePath}`;
}

async function relay(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const upstreamPath = buildUpstreamPath(path);
  if (!upstreamPath) {
    return NextResponse.json({ error: "INVALID_RELAY_PATH" }, { status: 400 });
  }

  // Preserve query string
  const search = req.nextUrl.search;
  const upstreamUrl = buildServiceUrl(RUNTIME_API_URL, upstreamPath, search);

  // Forward relevant headers, strip Next.js / host specifics
  const reqContentType = req.headers.get("Content-Type") ?? "";

  const forwarded = new Headers(Object.entries(buildRuntimeHeaders(session)));
  for (const headerName of PASSTHROUGH_REQUEST_HEADERS) {
    const value = req.headers.get(headerName);
    if (value) forwarded.set(headerName, value);
  }

  const init: RequestInit = {
    method: req.method,
    headers: forwarded,
    cache: "no-store",
  };

  // Pass body for mutating methods
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (reqContentType.startsWith("multipart/form-data")) {
      // Stream multipart body directly — the runtime has a busboy handler that
      // enforces its own file-size limit without buffering into memory.
      // The old base64-JSON approach capped effective uploads at ~192 KB due to
      // the 256 KB JSON body-parser limit on the runtime side.
      const clHeader = req.headers.get("content-length");
      if (clHeader !== null) {
        const contentLength = parseInt(clHeader, 10);
        if (!Number.isFinite(contentLength) || contentLength > 100 * 1024 * 1024) {
          return NextResponse.json(
            { error: "FILE_TOO_LARGE", message: "File too large (max 100 MB)" },
            { status: 413 },
          );
        }
      }
      // Preserve Content-Type including the multipart boundary parameter.
      forwarded.set("Content-Type", reqContentType);
      // duplex: "half" is required by the fetch spec for streaming request bodies.
      (init as Record<string, unknown>)["duplex"] = "half";
      init.body = req.body as BodyInit;
    } else {
      forwarded.set("Content-Type", reqContentType || "application/json");
      init.body = await req.text();
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // 204 No Content — return as-is
    if (upstream.status === 204) {
      const res = new NextResponse(null, { status: 204 });
      copySetCookieHeaders(upstream.headers, res.headers);
      copyTraceResponseHeaders(upstream.headers, res.headers);
      return res;
    }

    const contentType        = upstream.headers.get("Content-Type") ?? "application/json";
    const contentDisposition = upstream.headers.get("Content-Disposition");

    const resHeaders: Record<string, string> = { "Content-Type": contentType };
    if (contentDisposition) resHeaders["Content-Disposition"] = sanitizeContentDisposition(contentDisposition);

    const res = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: withTraceResponseHeaders(upstream.headers, resHeaders),
    });
    copySetCookieHeaders(upstream.headers, res.headers);
    return res;
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      console.error(`[relay] upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    console.error("[relay] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

export const GET = relay;
export const POST = relay;
export const PUT = relay;
export const PATCH = relay;
export const DELETE = relay;
