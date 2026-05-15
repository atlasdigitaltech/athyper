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

const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Creates a catch-all relay handler for a specific module prefix.
 *
 * Usage (in apps/web/app/api/<module>/[...path]/route.ts):
 *   const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("governance");
 *   export { GET, POST, PUT, PATCH, DELETE };
 *
 * Proxies /api/<module>/<rest> → runtime /api/<module>/<rest>
 * with Bearer auth + tenant context injected from the session.
 */
export function makeModuleRelay(modulePrefix: string) {
  type Params = { params: Promise<{ path: string[] }> };
  const safeModulePrefix = safePathFromSegments(modulePrefix.split("/"));
  if (!safeModulePrefix) {
    throw new Error(`Invalid module relay prefix: ${modulePrefix}`);
  }

  const handler = async function relay(req: NextRequest, { params }: Params): Promise<NextResponse> {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { path } = await params;
    const subPath = safePathFromSegments(path);
    if (!subPath) {
      return NextResponse.json({ error: "INVALID_RELAY_PATH" }, { status: 400 });
    }
    const search = req.nextUrl.search;
    const upstreamUrl = buildServiceUrl(RUNTIME_API_URL, `/api/${safeModulePrefix}/${subPath}`, search);

    const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));

    const init: RequestInit = { method: req.method, headers, cache: "no-store" };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const ct = req.headers.get("Content-Type") ?? "application/json";
      headers.set("Content-Type", ct);
      if (ct.startsWith("multipart/form-data")) {
        // Stream multipart directly — req.text() would corrupt binary data and
        // cap effective uploads at the JSON body-parser memory limit.
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
        const noContentRes = new NextResponse(null, { status: 204 });
        copySetCookieHeaders(upstream.headers, noContentRes.headers);
        copyTraceResponseHeaders(upstream.headers, noContentRes.headers);
        return noContentRes;
      }
      const ct = upstream.headers.get("Content-Type") ?? "application/json";
      const disposition = upstream.headers.get("Content-Disposition");
      const resHeaders: Record<string, string> = { "Content-Type": ct };
      if (disposition) resHeaders["Content-Disposition"] = sanitizeContentDisposition(disposition);
      const res = new NextResponse(upstream.body, {
        status: upstream.status,
        headers: withTraceResponseHeaders(upstream.headers, resHeaders),
      });
      // Forward Set-Cookie from backend (e.g. td_token for trusted-device registration)
      copySetCookieHeaders(upstream.headers, res.headers);
      return res;
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        console.error(`[relay:${modulePrefix}] upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
        return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
      }
      console.error(`[relay:${modulePrefix}] upstream error`, err);
      return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
    }
  };

  Object.defineProperty(handler, "name", { value: `relay:${modulePrefix}` });
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}
