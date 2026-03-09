import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { computeSessionState } from "@/lib/session-verdict";
import { getSessionRedis } from "@/lib/auth/session-redis";

interface ShellLayoutProps {
  children: React.ReactNode;
}

interface SessionGateResult {
  verdict: "pass" | "reauth_required" | "no_session";
  workspaceResolutionState: "pending" | "resolved";
}

/**
 * Resolve verdict for the current session without exposing tokens.
 * Also returns workspaceResolutionState so the shell layout can enforce
 * the pending-resolution allowlist (D.3) in a single Redis read.
 */
async function resolveVerdict(): Promise<SessionGateResult> {
  const cookieStore = await cookies();
  const sid = cookieStore.get("neon_sid")?.value;
  if (!sid) return { verdict: "no_session", workspaceResolutionState: "resolved" };

  // Platform admin sessions use "platform" namespace; tenant sessions use tenantId
  const realmCookie = cookieStore.get("neon_realm")?.value;
  const sessionNamespace =
    realmCookie === "platform"
      ? "platform"
      : (process.env.DEFAULT_TENANT_ID ?? "default");

  try {
    const redis = await getSessionRedis();
    const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) return { verdict: "no_session", workspaceResolutionState: "resolved" };

    const session = JSON.parse(raw) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    const { verdict } = computeSessionState(session, now);

    const workspaceResolutionState =
      session.workspaceResolutionState === "pending" ? "pending" : "resolved";

    return {
      verdict: verdict === "reauth_required" ? "reauth_required" : "pass",
      workspaceResolutionState,
    };
  } catch (err) {
    // Fail-open on Redis errors: maintain availability during transient outages.
    // BFF route handlers provide defense-in-depth for individual API calls.
    console.error("[session-gate] Redis error — failing open:", err);
    return { verdict: "pass", workspaceResolutionState: "resolved" };
  }
}

/**
 * Unified shell layout for both /wb/* and /app/* routes.
 * Reads sidebar preferences from cookies.
 *
 * Session Gate: Checks Redis session verdict on every SSR render.
 * If the session is expired or revoked, redirects to login with a returnUrl.
 * This protects all pages under the shell from direct-navigation bypass
 * (complements the edge middleware cookie-presence check).
 *
 * Note: AuthProvider is NOT set here because the workbench is not yet known.
 * It is set in the workbench sub-layout (/wb/[wb]/layout.tsx) and
 * entity sub-layout (/app/[entity]/layout.tsx).
 */
export default async function ShellLayout({ children }: ShellLayoutProps) {
  const { verdict, workspaceResolutionState } = await resolveVerdict();

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";

  if (verdict === "reauth_required" || verdict === "no_session") {
    // Platform paths redirect to OPS admin login
    if (pathname.startsWith("/platform")) {
      redirect("/ops_login");
    }
    // Redirect to /login and preserve the original URL so the user lands
    // back where they intended after re-authenticating.
    const returnUrl = encodeURIComponent(pathname);
    redirect(`/login?returnUrl=${returnUrl}`);
  }

  // ─── Pending-resolution allowlist (D.3) ──────────────────────
  // When workspace resolution is still pending, /wb/* routes are not
  // accessible — redirect to /auth/resolving so resolution can complete.
  // /workspace and /auth/resolving are allowed in pending state.
  if (workspaceResolutionState === "pending" && pathname.startsWith("/wb/")) {
    const resolvingUrl = `/auth/resolving?returnUrl=${encodeURIComponent(pathname)}`;
    redirect(resolvingUrl);
  }

  return <>{children}</>;
}
