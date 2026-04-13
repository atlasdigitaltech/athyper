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
