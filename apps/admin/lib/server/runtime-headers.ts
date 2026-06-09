import "server-only";

import type { V4Session } from "@athyper/auth-bff";

export const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";
export const TRACE_ID_HEADER = "X-Trace-ID";

export function buildRuntimeHeaders(session: V4Session): Record<string, string> {
  const hdrs: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Realm": session.realmKey,
    "X-Plane": session.planeKey,
  };

  const orgAliases = Object.keys(session.organizations);
  const activeOrgAlias = session.activeOrg && session.organizations[session.activeOrg]
    ? session.activeOrg
    : orgAliases[0] ?? null;

  if (activeOrgAlias) {
    hdrs["X-Org"] = activeOrgAlias;
  }

  const activeMembership = activeOrgAlias ? session.organizations[activeOrgAlias] : undefined;
  if (activeMembership?.tenantId) hdrs["X-Tenant-ID"] = activeMembership.tenantId;
  if (activeMembership?.tenantCode) hdrs["X-Tenant-Code"] = activeMembership.tenantCode;
  if (activeMembership?.contextType) hdrs["X-Org-Context-Type"] = activeMembership.contextType;
  if (activeMembership?.organizationId) hdrs["X-Organization-ID"] = activeMembership.organizationId;
  if (activeMembership?.organizationCode) hdrs["X-Organization-Code"] = activeMembership.organizationCode;
  if (activeMembership?.legalEntityId) hdrs["X-Legal-Entity-ID"] = activeMembership.legalEntityId;
  if (activeMembership?.legalEntityCode) hdrs["X-Legal-Entity-Code"] = activeMembership.legalEntityCode;

  if (orgAliases.length > 0) hdrs["X-Org-Aliases"] = orgAliases.join(",");

  if (activeMembership) {
    const roles = activeMembership.roles;
    if (roles.length > 0) hdrs["X-Workbenches"] = roles.join(",");
  }

  return hdrs;
}

export function buildServiceUrl(baseUrl: string, pathname: string, search = ""): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname}${search}`;
}

const CONTROL_CHARS = new RegExp("[\x00-\x1F\x7F]");

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

export function sanitizeContentDisposition(disposition: string): string {
  return disposition.replace(/[\r\n\0]/g, "");
}

export function copySetCookieHeaders(source: Headers, target: Headers): void {
  const getSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(source) : [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) target.append("Set-Cookie", cookie);
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

export function withTraceResponseHeaders(source: Headers, hdrs: Record<string, string>): Record<string, string> {
  const traceId = getTraceId(source);
  if (!traceId) return hdrs;
  return {
    ...hdrs,
    [TRACE_ID_HEADER]: traceId,
    "Access-Control-Expose-Headers": appendHeaderValue(hdrs["Access-Control-Expose-Headers"] ?? null, TRACE_ID_HEADER),
  };
}
