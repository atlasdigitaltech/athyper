/**
 * Shared environment-variable helpers for Athyper k6 performance tests.
 *
 * All tests import from this module rather than reading __ENV directly, so
 * missing or mis-typed variable names surface as a single clear error message
 * before the test begins.
 *
 * Required env vars (all tests):
 *   BASE_URL        — API root, e.g. http://localhost:3001/api
 *   TOKEN_TENANT_A  — Valid JWT for the primary load-test tenant
 *   ORG_TENANT_A    — Tenant org code (maps to master.tenant.code), e.g. demo-org
 *
 * Optional env vars:
 *   REALM_TENANT_A  — KC realm for tenant A (default: athyper)
 *   TOKEN_TENANT_B  — JWT for a second tenant (isolation tests)
 *   ORG_TENANT_B    — Second tenant org code
 *   REALM_TENANT_B  — KC realm for tenant B (default: athyper)
 */

/** Validated env values exposed to all test scripts. */
export const ENV = {
  // ── Server ─────────────────────────────────────────────────────────────────
  BASE_URL: requireEnv("BASE_URL"),

  // ── Tenant A (primary) ────────────────────────────────────────────────────
  TOKEN_A: requireEnv("TOKEN_TENANT_A"),
  ORG_A:   requireEnv("ORG_TENANT_A"),
  REALM_A: __ENV.REALM_TENANT_A || "athyper",

  // ── Tenant B (isolation / cross-tenant tests) ──────────────────────────────
  TOKEN_B: __ENV.TOKEN_TENANT_B || "",
  ORG_B:   __ENV.ORG_TENANT_B   || "",
  REALM_B: __ENV.REALM_TENANT_B || "athyper",
};

/**
 * Read a required env variable; abort with a clear message if missing.
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const val = __ENV[name];
  if (!val) {
    throw new Error(
      `[athyper-perf] Missing required env var: ${name}\n` +
      `Pass it with: k6 run -e ${name}=<value> <script>`,
    );
  }
  return val;
}
