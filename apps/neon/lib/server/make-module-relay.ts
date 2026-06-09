import "server-only";

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
import { getNeonServerSession } from "@/lib/server/session";

const UPSTREAM_TIMEOUT_MS = 30_000;

export function makeModuleRelay(modulePrefix: string) {
  type Params = { params: Promise<{ path: string[] }> };
  const safeModulePrefix = safePathFromSegments(modulePrefix.split("/"));
  if (!safeModulePrefix) {
    throw new Error(`Invalid module relay prefix: ${modulePrefix}`);
  }

  const handler = async function relay(req: NextRequest, { params }: Params): Promise<NextResponse> {
    const session = await getNeonServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { path } = await params;
    const subPath = safePathFromSegments(path);
    if (!subPath) {
      return NextResponse.json({ error: "INVALID_RELAY_PATH" }, { status: 400 });
    }

    const upstreamUrl = buildServiceUrl(
      RUNTIME_API_URL,
      `/api/${safeModulePrefix}/${subPath}`,
      req.nextUrl.search,
    );
    const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
    const init: RequestInit = {
      method: req.method,
      headers,
      cache: "no-store",
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = req.headers.get("Content-Type") ?? "application/json";
      headers.set("Content-Type", contentType);
      if (contentType.startsWith("multipart/form-data")) {
        (init as Record<string, unknown>)["duplex"] = "half";
        init.body = req.body as BodyInit;
      } else {
        init.body = await req.text();
      }
    }

    try {
      const upstream = await fetch(upstreamUrl, {
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
        console.error(`[relay:${modulePrefix}] upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
        return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
      }
      console.error(`[relay:${modulePrefix}] upstream error`, error);
      return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
    }
  };

  Object.defineProperty(handler, "name", { value: `relay:${modulePrefix}` });
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}
