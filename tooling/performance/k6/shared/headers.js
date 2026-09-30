/**
 * Shared HTTP header builders for Athyper k6 performance tests.
 *
 * The server resolves tenant context from three headers:
 *   Authorization: Bearer <token>  — JWT, verified by KC adapter
 *   X-Org: <tenant.code>           — maps to master.tenant.code
 *   X-Realm: <realm>               — KC realm (default: "athyper")
 *
 * Usage:
 *   import { headersA, headersB, jsonHeaders } from './shared/headers.js';
 *   const res = http.get(url, { headers: headersA(ENV) });
 */

/**
 * Build auth + tenant headers for Tenant A.
 * @param {{ TOKEN_A: string, ORG_A: string, REALM_A: string }} env
 * @returns {Record<string, string>}
 */
export function headersA(env) {
  return {
    Authorization: `Bearer ${env.TOKEN_A}`,
    "X-Org":       env.ORG_A,
    "X-Realm":     env.REALM_A,
    "Content-Type": "application/json",
  };
}

/**
 * Build auth + tenant headers for Tenant B.
 * Throws if TOKEN_B / ORG_B are not configured — use only in isolation tests.
 * @param {{ TOKEN_B: string, ORG_B: string, REALM_B: string }} env
 * @returns {Record<string, string>}
 */
export function headersB(env) {
  if (!env.TOKEN_B || !env.ORG_B) {
    throw new Error(
      "[athyper-perf] Tenant B headers required but TOKEN_TENANT_B / ORG_TENANT_B not set.\n" +
      "Pass both env vars to run tenant-isolation scenarios.",
    );
  }
  return {
    Authorization: `Bearer ${env.TOKEN_B}`,
    "X-Org":       env.ORG_B,
    "X-Realm":     env.REALM_B,
    "Content-Type": "application/json",
  };
}

/**
 * Content-type-only headers (no auth) — used for public or pre-authed paths.
 * @returns {Record<string, string>}
 */
export function jsonHeaders() {
  return { "Content-Type": "application/json" };
}
