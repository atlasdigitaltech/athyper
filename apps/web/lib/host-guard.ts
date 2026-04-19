// F8 Phase 1 — host-guard decision logic.
//
// Pure function extracted from apps/web/middleware.ts so the decision table
// can be unit-tested without spinning up Next.js or mocking next/server.
// The response shaping (JSON 421 vs redirect vs text 421) stays in the
// middleware — this module only answers "allow or reject?".
//
// Tested by: server/src/__tests__/web-middleware-host-guard.test.ts

export type HostGuardDecision =
  | { action: "pass" }
  | { action: "reject"; reason: "host_not_allowed" | "host_missing" };

export function decideHostGuard(args: {
  host: string | null | undefined;
  allowedHosts: ReadonlySet<string>;
  allowDirectAccess: boolean;
}): HostGuardDecision {
  const { host, allowedHosts, allowDirectAccess } = args;

  // Bypass explicitly or when the allowlist is not configured — preserves
  // current dev behaviour (no ALLOWED_HOSTS set → anything goes).
  if (allowDirectAccess || allowedHosts.size === 0) {
    return { action: "pass" };
  }

  if (!host) {
    return { action: "reject", reason: "host_missing" };
  }

  // Strip port; Host headers arrive as "neon.athyper.local:3000" in dev.
  const normalised = host.toLowerCase().replace(/:\d+$/, "");
  if (allowedHosts.has(normalised)) {
    return { action: "pass" };
  }

  return { action: "reject", reason: "host_not_allowed" };
}
