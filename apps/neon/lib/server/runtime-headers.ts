import "server-only";

import type { V4Session } from "@athyper/auth-bff";

export const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";
export const TRACE_ID_HEADER = "X-Trace-ID";

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
  if (activeOrgAlias) {
    headers["X-Org"] = activeOrgAlias;
  }

  const activeMembership = activeOrgAlias ? session.organizations[activeOrgAlias] : undefined;
  if (activeMembership?.tenantId) headers["X-Tenant-ID"] = activeMembership.tenantId;
  if (activeMembership?.tenantCode) headers["X-Tenant-Code"] = activeMembership.tenantCode;
  if (activeMembership?.contextType) headers["X-Org-Context-Type"] = activeMembership.contextType;
  if (activeMembership?.organizationId) headers["X-Organization-ID"] = activeMembership.organizationId;
  if (activeMembership?.organizationCode) headers["X-Organization-Code"] = activeMembership.organizationCode;
  if (activeMembership?.legalEntityId) headers["X-Legal-Entity-ID"] = activeMembership.legalEntityId;
  if (activeMembership?.legalEntityCode) headers["X-Legal-Entity-Code"] = activeMembership.legalEntityCode;

  if (orgAliases.length > 0) {
    headers["X-Org-Aliases"] = orgAliases.join(",");
  }

  if (activeMembership) {
    const roles = activeMembership.roles;
    if (roles.length > 0) {
      headers["X-Workbenches"] = roles.join(",");
    }
  }

  return headers;
}

export function buildRuntimeUrl(pathname: string): string {
  return `${RUNTIME_API_URL.replace(/\/+$/, "")}${pathname}`;
}

export function buildServiceUrl(baseUrl: string, pathname: string, search = ""): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname}${search}`;
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

export function sanitizeContentDisposition(disposition: string): string {
  return disposition.replace(/[\r\n\0]/g, "");
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

function getTraceId(headers: Headers): string | null {
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
