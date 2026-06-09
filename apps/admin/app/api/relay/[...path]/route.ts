import { type NextRequest, NextResponse } from "next/server";
import {
  RUNTIME_API_URL,
  buildRuntimeHeaders,
  buildServiceUrl,
  copySetCookieHeaders,
  copyTraceResponseHeaders,
  safePathFromSegments,
  sanitizeContentDisposition,
  withTraceResponseHeaders,
} from "@/lib/server/runtime-headers";
import { getAdminServerSession } from "@/lib/server/session";

type Params = { params: Promise<{ path: string[] }> };

const UPSTREAM_TIMEOUT_MS = 30_000;
const PASSTHROUGH_REQUEST_HEADERS = ["Idempotency-Key", "X-Idempotency-Key"] as const;

function buildUpstreamPath(path: string[]): string | null {
  const safePath = safePathFromSegments(path);
  if (!safePath) return null;
  return safePath.startsWith("api/") ? `/${safePath}` : `/api/${safePath}`;
}

async function relay(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getAdminServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const upstreamPath = buildUpstreamPath(path);
  if (!upstreamPath) {
    return NextResponse.json({ error: "INVALID_RELAY_PATH" }, { status: 400 });
  }

  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
  for (const headerName of PASSTHROUGH_REQUEST_HEADERS) {
    const value = req.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const contentType = req.headers.get("Content-Type") ?? "application/json";
    headers.set("Content-Type", contentType);
    if (contentType.startsWith("multipart/form-data")) {
      const contentLength = Number.parseInt(req.headers.get("content-length") ?? "", 10);
      if (Number.isFinite(contentLength) && contentLength > 100 * 1024 * 1024) {
        return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
      }
      (init as Record<string, unknown>)["duplex"] = "half";
      init.body = req.body as BodyInit;
    } else {
      init.body = await req.text();
    }
  }

  try {
    const upstream = await fetch(buildServiceUrl(RUNTIME_API_URL, upstreamPath, req.nextUrl.search), {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (upstream.status === 204) {
      const response = new NextResponse(null, { status: 204 });
      copySetCookieHeaders(upstream.headers, response.headers);
      copyTraceResponseHeaders(upstream.headers, response.headers);
      return response;
    }

    const contentType = upstream.headers.get("Content-Type") ?? "application/json";
    const contentDisposition = upstream.headers.get("Content-Disposition");
    const responseHeaders: Record<string, string> = { "Content-Type": contentType };
    if (contentDisposition) {
      responseHeaders["Content-Disposition"] = sanitizeContentDisposition(contentDisposition);
    }

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: withTraceResponseHeaders(upstream.headers, responseHeaders),
    });
    copySetCookieHeaders(upstream.headers, response.headers);
    return response;
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      console.error(`[admin-relay] upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    console.error("[admin-relay] upstream error", error);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

export const GET = relay;
export const POST = relay;
export const PUT = relay;
export const PATCH = relay;
export const DELETE = relay;
