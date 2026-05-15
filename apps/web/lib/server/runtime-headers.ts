import type { V4Session } from "@/lib/auth/types";

/**
 * Shared BFF utilities — used by all route handlers that proxy to the
 * runtime or collab services.
 *
 * Centralises:
 *   - Service base URLs (env vars with dev fallbacks)
 *   - Standard auth header construction
 *   - Allowlist-based query-param forwarding
 */

export const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";
export const COLLAB_API_URL  = process.env.COLLAB_API_URL  ?? RUNTIME_API_URL;
export const TRACE_ID_HEADER = "X-Trace-ID";

/** Build the standard auth headers for any runtime / collab service call. */
export function buildRuntimeHeaders(session: V4Session): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Realm": session.realmKey,
  };
  if (session.activeOrg) headers["X-Org"] = session.activeOrg;
  // Pass the full enriched org alias list so the runtime session service
  // doesn't have to re-extract from the JWT (KC truncates the organization
  // claim for users with many orgs).
  const aliases = Object.keys(session.organizations);
  if (aliases.length > 0) headers["X-Org-Aliases"] = aliases.join(",");
  // Pass enriched workbenches for the active org so the runtime session service
  // doesn't have to rely solely on KC JWT roles (which are absent when the
  // neon-web client has no roles configured).
  if (session.activeOrg && session.organizations[session.activeOrg]) {
    const roles = session.organizations[session.activeOrg]!.roles;
    if (roles.length > 0) headers["X-Workbenches"] = roles.join(",");
  }
  return headers;
}

/**
 * Forward only the allowlisted query params from a BFF request URL to the
 * upstream service. Drops params not in the list (prevents header/param injection).
 */
export function forwardSearchParams(url: string, allowed: readonly string[]): string {
  const { searchParams } = new URL(url);
  const params = new URLSearchParams();
  for (const key of allowed) {
    const v = searchParams.get(key);
    if (v !== null) params.set(key, v);
  }
  return params.toString();
}

/**
 * Strip characters that could break HTTP header boundaries or inject new headers.
 * Only CR, LF, and NUL are dangerous here — everything else is valid filename content.
 */
export function sanitizeContentDisposition(disposition: string): string {
  return disposition.replace(/[\r\n\0]/g, "");
}

export function safePathFromSegments(segments: readonly string[]): string | null {
  const encoded: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return null;
    if (segment.includes("/") || segment.includes("\\") || segment.includes("?") || segment.includes("#")) return null;
    if (/[\u0000-\u001F\u007F]/.test(segment)) return null;
    encoded.push(encodeURIComponent(segment));
  }

  return encoded.join("/");
}

export function buildServiceUrl(baseUrl: string, pathname: string, search = ""): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname}${search}`;
}

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
    (existing ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  values.add(value);
  return [...values].join(", ");
}

export function getTraceId(headers: Headers): string | null {
  const traceId = headers.get(TRACE_ID_HEADER);
  if (!traceId || !/^[0-9a-f]{32}$/i.test(traceId)) return null;
  return traceId.toLowerCase();
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
