import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getWorkbenchDefaultRoute } from "@/lib/auth/workbench-config";
import { isWorkbench } from "@/lib/auth/types";
import ResolvingClient from "./ResolvingClient";

async function getSession() {
  const cookieStore = await cookies();
  const sid = cookieStore.get("neon_sid")?.value;
  if (!sid) return null;

  const realmCookie = cookieStore.get("neon_realm")?.value;
  const sessionNamespace =
    realmCookie === "platform"
      ? "platform"
      : (process.env.DEFAULT_TENANT_ID ?? "default");

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379/0",
      socket: { connectTimeout: 3000, reconnectStrategy: false },
    });
    redis.on("error", () => {});
    if (!redis.isOpen) await redis.connect();

    const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    // Suppress quit errors: if the connection was reset mid-operation the
    // quit() call itself may reject, which would override the catch { return null }
    // and propagate an unhandled rejection to the Next.js error overlay.
    try { await redis?.quit(); } catch { /* ignore */ }
  }
}

interface ResolvingPageProps {
  searchParams: Promise<{ returnUrl?: string }>;
}

/**
 * /auth/resolving — workspace resolution handoff page (A.8 + C.4)
 *
 * Server-side guard (A.8):
 *   - No session                       → /login
 *   - resolved + workbench set         → active workbench default route
 *   - resolved + null workbench        → /workspace (inconsistent state repair)
 *   - missing workspaceResolutionState → treat as resolved, apply null-check
 *   - pending                          → allow through to client handoff
 *
 * Client handoff (C.4):
 *   Reads localStorage.neon_last_workbench, calls POST /api/auth/resolve-workspace,
 *   then follows the server decision.
 */
export default async function ResolvingPage({ searchParams }: ResolvingPageProps) {
  const { returnUrl } = await searchParams;
  const session = await getSession();

  // ── No session → /login ──────────────────────────────────────
  if (!session) {
    const loginUrl = returnUrl
      ? `/login?returnUrl=${encodeURIComponent(returnUrl)}`
      : "/login";
    redirect(loginUrl);
  }

  const resolutionState =
    session.workspaceResolutionState === "pending" ? "pending" : "resolved";
  const workbench = session.workbench as string | null | undefined;

  // ── Resolved + workbench exists → active workbench ──────────
  if (resolutionState === "resolved" && workbench && isWorkbench(workbench)) {
    // Honour returnUrl if it points into this workbench; otherwise default route
    if (returnUrl && returnUrl.startsWith(`/wb/${workbench}/`)) {
      redirect(returnUrl);
    }
    redirect(getWorkbenchDefaultRoute(workbench));
  }

  // ── Resolved + null workbench → /workspace (state repair) ───
  if (resolutionState === "resolved" && !workbench) {
    redirect("/workspace");
  }

  // ── Pending → allow through to client handoff ────────────────
  return <ResolvingClient returnUrl={returnUrl ?? null} />;
}
