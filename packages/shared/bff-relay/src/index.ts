// Server-only: this module performs upstream fetches with the caller's session.
// Consumers must import it from a route file that begins with `import "server-only"`
// to ensure it never lands in a client bundle.

import { type NextRequest, NextResponse } from "next/server";
import type { V4Session } from "@athyper/auth-bff";

export const TRACE_ID_HEADER = "X-Trace-ID";

const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_UPLOAD_CAP_BYTES = 100 * 1024 * 1024;
const CONTROL_CHARS = new RegExp("[\\x00-\\x1F\\x7F]");

// ─── Runtime header construction ──────────────────────────────────────────────

export function buildRuntimeHeaders(session: V4Session): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Realm": session.realmKey,
    "X-Plane": session.planeKey,
  };

  const orgAliases = Object.keys(session.organizations);
  const activeOrgAlias = session.activeOrg && session.organizations[session.activeOrg]
    ? session.activeOrg
    : orgAliases[0] ?? null;
  if (activeOrgAlias) headers["X-Org"] = activeOrgAlias;

  const activeMembership = activeOrgAlias ? session.organizations[activeOrgAlias] : undefined;
  if (activeMembership?.tenantId) headers["X-Tenant-ID"] = activeMembership.tenantId;
  if (activeMembership?.tenantCode) headers["X-Tenant-Code"] = activeMembership.tenantCode;
  if (activeMembership?.contextType) headers["X-Org-Context-Type"] = activeMembership.contextType;
  if (activeMembership?.organizationId) headers["X-Organization-ID"] = activeMembership.organizationId;
  if (activeMembership?.organizationCode) headers["X-Organization-Code"] = activeMembership.organizationCode;
  if (activeMembership?.legalEntityId) headers["X-Legal-Entity-ID"] = activeMembership.legalEntityId;
  if (activeMembership?.legalEntityCode) headers["X-Legal-Entity-Code"] = activeMembership.legalEntityCode;

  if (orgAliases.length > 0) headers["X-Org-Aliases"] = orgAliases.join(",");

  if (activeMembership) {
    const roles = activeMembership.roles;
    if (roles.length > 0) headers["X-Workbenches"] = roles.join(",");
  }

  return headers;
}

// ─── Path & URL helpers ───────────────────────────────────────────────────────

export function safePathFromSegments(segments: readonly string[]): string | null {
  const encoded: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return null;
    if (segment.includes("/") || segment.includes("\\") || segment.includes("?") || segment.includes("#")) return null;
    if (CONTROL_CHARS.test(segment)) return null;
    encoded.push(encodeURIComponent(segment));
  }
  return encoded.join("/");
}

export function buildServiceUrl(baseUrl: string, pathname: string, search = ""): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname}${search}`;
}

export function sanitizeContentDisposition(disposition: string): string {
  return disposition.replace(/[\r\n\0]/g, "");
}

// ─── Header copying ───────────────────────────────────────────────────────────

export function copySetCookieHeaders(source: Headers, target: Headers): void {
  const getSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = typeof getSetCookie === "function" ? getSetCookie.call(source) : [];
  if (cookies.length > 0) {
    for (const cookie of cookies) target.append("Set-Cookie", cookie);
    return;
  }
  const setCookie = source.get("Set-Cookie");
  if (setCookie) target.append("Set-Cookie", setCookie);
}

function appendHeaderValue(existing: string | null, value: string): string {
  const values = new Set(
    (existing ?? "").split(",").map((p) => p.trim()).filter(Boolean),
  );
  values.add(value);
  return [...values].join(", ");
}

function getTraceId(source: Headers): string | null {
  const id = source.get(TRACE_ID_HEADER);
  if (!id || !/^[0-9a-f]{32}$/i.test(id)) return null;
  return id.toLowerCase();
}

export function copyTraceResponseHeaders(source: Headers, target: Headers): void {
  const traceId = getTraceId(source);
  if (!traceId) return;
  target.set(TRACE_ID_HEADER, traceId);
  target.set(
    "Access-Control-Expose-Headers",
    appendHeaderValue(target.get("Access-Control-Expose-Headers"), TRACE_ID_HEADER),
  );
}

export function withTraceResponseHeaders(source: Headers, headers: Record<string, string>): Record<string, string> {
  const traceId = getTraceId(source);
  if (!traceId) return headers;
  return {
    ...headers,
    [TRACE_ID_HEADER]: traceId,
    "Access-Control-Expose-Headers": appendHeaderValue(headers["Access-Control-Expose-Headers"] ?? null, TRACE_ID_HEADER),
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export type RelayParams = { params: Promise<{ path: string[] }> };
export type RelayHandler = (req: NextRequest, ctx: RelayParams) => Promise<NextResponse>;

export interface RelayHandlerOptions {
  /** Resolves the caller's V4Session from the request. Return null to reject as 401. */
  resolveSession: (req: NextRequest) => Promise<V4Session | null>;
  /** Upstream runtime base URL (e.g. process.env.RUNTIME_API_URL). */
  runtimeApiUrl: string;
  /** Log/error prefix — typically the app + namespace, e.g. "neon:me" or "admin:relay". */
  appLabel: string;
  /**
   * If set, the relay namespace prefix that is mounted (e.g. "me", "admin").
   * Incoming path segments are appended after `/api/<routePrefix>/`.
   * When omitted, the generic relay behavior is used: incoming paths that start
   * with "api/" are forwarded as-is at the root; otherwise they get a `/api/` prefix.
   */
  routePrefix?: string;
  /** Request headers to forward unchanged from caller to upstream. */
  passthroughHeaders?: readonly string[];
  /** Reject multipart uploads above this size. Default 100 MB. */
  uploadCapBytes?: number;
  /** Upstream fetch timeout. Default 30 s. */
  upstreamTimeoutMs?: number;
}

export function buildRelayHandler(options: RelayHandlerOptions): RelayHandler {
  const {
    resolveSession,
    runtimeApiUrl,
    appLabel,
    routePrefix,
    passthroughHeaders = [],
    uploadCapBytes = DEFAULT_UPLOAD_CAP_BYTES,
    upstreamTimeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS,
  } = options;

  const sanitizedPrefix = routePrefix
    ? safePathFromSegments(routePrefix.split("/"))
    : null;
  if (routePrefix && !sanitizedPrefix) {
    throw new Error(`Invalid relay routePrefix: ${routePrefix}`);
  }

  function resolveUpstreamPath(path: string[]): string | null {
    const safePath = safePathFromSegments(path);
    if (!safePath) return null;
    if (sanitizedPrefix) return `/api/${sanitizedPrefix}/${safePath}`;
    return safePath.startsWith("api/") ? `/${safePath}` : `/api/${safePath}`;
  }

  return async function relay(req: NextRequest, { params }: RelayParams): Promise<NextResponse> {
    const session = await resolveSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in again to continue." },
        { status: 401 },
      );
    }

    const { path } = await params;
    const upstreamPath = resolveUpstreamPath(path);
    if (!upstreamPath) {
      return NextResponse.json({ error: "INVALID_RELAY_PATH" }, { status: 400 });
    }

    const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
    for (const headerName of passthroughHeaders) {
      const value = req.headers.get(headerName);
      if (value) headers.set(headerName, value);
    }

    const init: RequestInit = { method: req.method, headers, cache: "no-store" };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = req.headers.get("Content-Type") ?? "application/json";
      headers.set("Content-Type", contentType);
      if (contentType.startsWith("multipart/form-data")) {
        const contentLength = Number.parseInt(req.headers.get("content-length") ?? "", 10);
        if (Number.isFinite(contentLength) && contentLength > uploadCapBytes) {
          return NextResponse.json(
            { error: "FILE_TOO_LARGE", message: `File too large (max ${Math.floor(uploadCapBytes / (1024 * 1024))} MB)` },
            { status: 413 },
          );
        }
        (init as Record<string, unknown>)["duplex"] = "half";
        init.body = req.body as BodyInit;
      } else {
        init.body = await req.text();
      }
    }

    try {
      const upstream = await fetch(buildServiceUrl(runtimeApiUrl, upstreamPath, req.nextUrl.search), {
        ...init,
        signal: AbortSignal.timeout(upstreamTimeoutMs),
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
        console.error(`[${appLabel}] upstream timeout after ${upstreamTimeoutMs}ms`);
        return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
      }
      console.error(`[${appLabel}] upstream error`, error);
      return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
    }
  };
}
