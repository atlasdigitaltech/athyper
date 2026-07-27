// Server-only: this module performs upstream fetches with the caller's session.
// Consumers must import it from a route file that begins with `import "server-only"`
// to ensure it never lands in a client bundle.

import { type NextRequest, NextResponse } from "next/server";
import type { V4Session } from "@athyper/auth-bff";

export {
  buildRuntimeApiUrl,
  normalizeRuntimeApiUrl,
} from "./runtime-url";

export const TRACE_ID_HEADER = "X-Trace-ID";

const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_UPLOAD_CAP_BYTES = 100 * 1024 * 1024;
const CONTROL_CHARS = new RegExp("[\\x00-\\x1F\\x7F]");

type RelayWorkContext = {
  type: "legal_entity" | "operating_organization";
  id: string;
  tenantId: string;
  domain?: "procurement" | "sales";
  scopeVersion?: number;
};

type RelaySession = V4Session & {
  activeWorkContext?: RelayWorkContext;
  authEpoch?: number;
};

function isRelayWorkContext(value: unknown): value is RelayWorkContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<RelayWorkContext>;
  return (context.type === "legal_entity" || context.type === "operating_organization")
    && typeof context.id === "string"
    && context.id.length > 0
    && typeof context.tenantId === "string"
    && context.tenantId.length > 0;
}

// ─── Runtime header construction ──────────────────────────────────────────────

export function buildRuntimeHeaders(session: V4Session): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Realm": session.realmKey,
    "X-Plane": session.planeKey,
  };

  const orgAliases = Object.keys(session.organizations);
  const contextAlias = session.activeWorkContext
    ? orgAliases.find((alias) => {
        const membership = session.organizations[alias];
        return [membership?.id, membership?.organizationId, membership?.legalEntityId]
          .includes(session.activeWorkContext?.id);
      })
    : undefined;
  // Prefer the membership identified by the typed context. A session can be
  // read while an older context activation is being migrated; choosing
  // activeOrg first in that case would emit X-Org for one membership and
  // X-Work-Context-* for another, which the runtime must reject.
  const activeOrgAlias = contextAlias
    ?? (session.activeOrg && session.organizations[session.activeOrg]
      ? session.activeOrg
      : orgAliases[0] ?? null);
  const activeMembership = activeOrgAlias ? session.organizations[activeOrgAlias] : undefined;
  // A session refresh can retain the selected typed context while its
  // membership map is being re-hydrated. Keep relaying that context so the
  // runtime receives a tenant stamp instead of treating the caller as
  // tenant-less. When a matching membership is available it remains the
  // preferred source, preserving the alias/header consistency contract.
  const activeContext = activeMembership
    ? toRelayWorkContext(activeMembership)
    : isRelayWorkContext(session.activeWorkContext)
      ? session.activeWorkContext
      : undefined;

  // X-Org remains the compatibility contract for the runtime tenant stamp and
  // the platform/notification handlers. The typed headers below are the
  // authoritative work-context contract; both are derived from the same
  // session-selected membership and are never caller-controlled.
  if (activeOrgAlias) headers["X-Org"] = activeOrgAlias;
  const tenantId = activeContext?.tenantId ?? activeMembership?.tenantId;
  const tenantCode = activeMembership?.tenantCode ?? tenantCodeFromAlias(activeOrgAlias);
  if (tenantId) headers["X-Tenant-ID"] = tenantId;
  if (tenantCode) headers["X-Tenant-Code"] = tenantCode;

  if (activeMembership?.contextType) headers["X-Org-Context-Type"] = activeMembership.contextType;
  const organizationId = activeMembership?.organizationId
    ?? (activeContext?.type === "legal_entity" ? activeContext.id : undefined);
  if (organizationId) headers["X-Organization-ID"] = organizationId;
  if (activeMembership?.organizationCode) headers["X-Organization-Code"] = activeMembership.organizationCode;
  if (activeMembership?.legalEntityId) headers["X-Legal-Entity-ID"] = activeMembership.legalEntityId;
  if (activeMembership?.legalEntityCode) headers["X-Legal-Entity-Code"] = activeMembership.legalEntityCode;

  if (activeContext) {
    headers["X-Work-Context-Type"] = activeContext.type;
    headers["X-Work-Context-ID"] = activeContext.id;
    if (activeContext.domain) headers["X-Work-Context-Domain"] = activeContext.domain;
    if (activeContext.scopeVersion !== undefined) headers["X-Scope-Version"] = String(activeContext.scopeVersion);
  }
  const authEpoch = session.authEpoch ?? activeMembership?.authEpoch;
  if (authEpoch !== undefined) headers["X-Auth-Epoch"] = String(authEpoch);

  // Fiscal-context header — read by @athyper/svc-shared::resolveActiveFiscalContext
  // to resolve the caller's timezone, week-start, and fiscal-year-start when
  // resolving relative date-range filter tokens (`@this_week`, `@this_quarter`,
  // etc.). When absent, the runtime falls back to the user's default company
  // code from `master.principal_ui_profile`, then to calendar defaults.
  if (session.activeCompanyCodeId) headers["X-Company-Code-ID"] = session.activeCompanyCodeId;

  if (orgAliases.length > 0) headers["X-Org-Aliases"] = orgAliases.join(",");

  if (activeMembership) {
    const roles = activeMembership.roles;
    if (roles.length > 0) headers["X-Workbenches"] = roles.join(",");
  }

  return headers;
}

function tenantCodeFromAlias(alias: string | null): string | undefined {
  const code = alias?.split("--", 1)[0]?.trim();
  return code || undefined;
}

function toRelayWorkContext(membership: RelaySession["organizations"][string]): RelayWorkContext | undefined {
  const type = membership.contextType === "operating_organization"
    ? "operating_organization"
    : membership.contextType === "legal_entity"
      ? "legal_entity"
      : undefined;
  const id = membership.organizationId ?? membership.legalEntityId ?? membership.id;
  const tenantId = membership.tenantId;
  if (!type || !id || !tenantId) return undefined;
  return {
    type,
    id,
    tenantId,
    ...(membership.workContextDomain ? { domain: membership.workContextDomain } : {}),
    ...(membership.scopeVersion !== undefined ? { scopeVersion: membership.scopeVersion } : {}),
  };
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
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const baseEndsWithApi = /\/api$/i.test(normalizedBase);
  const normalizedPath = baseEndsWithApi && /^\/api(?:\/|$)/i.test(pathname)
    ? pathname.replace(/^\/api(?=\/|$)/i, "")
    : pathname;
  const safePath = normalizedPath === "" ? "/" : normalizedPath;

  return `${normalizedBase}${safePath}${search}`;
}

export function sanitizeContentDisposition(disposition: string): string {
  return disposition.replace(/[\r\n\0]/g, "");
}

// ─── Header copying ───────────────────────────────────────────────────────────

// Upstream Set-Cookie headers are intentionally NOT forwarded. The runtime API is
// an internal service whose cookies would otherwise land in the browser cookie jar
// alongside the BFF-issued session cookie — a confused-deputy / session-fixation
// surface. Only the auth-bff routes set browser cookies, and they build them locally.

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
  /**
   * Classifies approved long-lived streaming routes. The timeout still applies
   * while connecting, and is disabled only after the upstream confirms an SSE
   * response with Content-Type: text/event-stream.
   */
  isStreamingRequest?: (input: {
    request: NextRequest;
    upstreamPath: string;
  }) => boolean;
}

function isEventStream(headers: Headers): boolean {
  return (headers.get("Content-Type") ?? "")
    .toLowerCase()
    .startsWith("text/event-stream");
}

export function isNotificationEventStreamRequest(input: {
  request: Pick<NextRequest, "method">;
  upstreamPath: string;
}): boolean {
  return input.request.method === "GET"
    && input.upstreamPath === "/api/platform/notifications/stream";
}

function createStreamingBody(
  upstreamBody: ReadableStream<Uint8Array>,
  controller: AbortController,
  requestSignal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  const abortUpstream = () => {
    if (!controller.signal.aborted) controller.abort(requestSignal?.reason);
  };

  if (requestSignal?.aborted) abortUpstream();
  else requestSignal?.addEventListener("abort", abortUpstream, { once: true });

  const cleanup = () => {
    requestSignal?.removeEventListener("abort", abortUpstream);
  };

  return new ReadableStream<Uint8Array>({
    async pull(streamController) {
      try {
        const result = await reader.read();
        if (result.done) {
          cleanup();
          streamController.close();
          return;
        }
        streamController.enqueue(result.value);
      } catch (error) {
        cleanup();
        streamController.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      if (!controller.signal.aborted) controller.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  });
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
    isStreamingRequest,
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
    const streamingRequest = isStreamingRequest?.({ request: req, upstreamPath }) === true;

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
      const streamController = streamingRequest ? new AbortController() : null;
      const streamTimeout = streamController
        ? setTimeout(() => streamController.abort(new DOMException(
            `Upstream did not respond within ${upstreamTimeoutMs}ms`,
            "TimeoutError",
          )), upstreamTimeoutMs)
        : null;
      const upstream = await fetch(buildServiceUrl(runtimeApiUrl, upstreamPath, req.nextUrl.search), {
        ...init,
        signal: streamController
          ? (req.signal
              ? AbortSignal.any([streamController.signal, req.signal])
              : streamController.signal)
          : AbortSignal.timeout(upstreamTimeoutMs),
      });

      const confirmedEventStream = streamingRequest && isEventStream(upstream.headers);
      if (confirmedEventStream && streamTimeout) clearTimeout(streamTimeout);

      if (upstream.status === 204) {
        if (streamTimeout) clearTimeout(streamTimeout);
        const response = new NextResponse(null, { status: 204 });
        response.headers.set("Cache-Control", "private, no-store");
        copyTraceResponseHeaders(upstream.headers, response.headers);
        return response;
      }

      const contentType = upstream.headers.get("Content-Type") ?? "application/json";
      const contentDisposition = upstream.headers.get("Content-Disposition");
      const responseHeaders: Record<string, string> = { "Content-Type": contentType };
      if (contentDisposition) {
        responseHeaders["Content-Disposition"] = sanitizeContentDisposition(contentDisposition);
      }
      // Preserve Content-Length on download passthrough so the browser can show
      // accurate progress for CSV / XLSX exports.
      const contentLengthHeader = upstream.headers.get("Content-Length");
      if (contentLengthHeader) responseHeaders["Content-Length"] = contentLengthHeader;
      if (confirmedEventStream) {
        const cacheControl = upstream.headers.get("Cache-Control");
        const accelBuffering = upstream.headers.get("X-Accel-Buffering");
        const feedMode = upstream.headers.get("X-Feed-Mode");
        responseHeaders["Cache-Control"] = cacheControl ?? "no-cache, no-transform";
        responseHeaders["X-Accel-Buffering"] = accelBuffering ?? "no";
        if (feedMode) responseHeaders["X-Feed-Mode"] = feedMode;
      } else {
        // Every ordinary relay response is authenticated and can be
        // tenant/principal-effective. Never let an upstream omission or
        // permissive cache directive make it shared-cacheable.
        responseHeaders["Cache-Control"] = "private, no-store";
      }

      const responseBody = confirmedEventStream && upstream.body && streamController
        ? createStreamingBody(upstream.body, streamController, req.signal)
        : upstream.body;

      return new NextResponse(responseBody, {
        status: upstream.status,
        headers: withTraceResponseHeaders(upstream.headers, responseHeaders),
      });
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
