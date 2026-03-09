import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isWorkbench, type Workbench } from "@/lib/auth/types";
import WorkspaceClient from "./WorkspaceClient";

async function getSessionData() {
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

    const session = JSON.parse(raw) as Record<string, unknown>;

    const allowedWorkbenches: Workbench[] = Array.isArray(session.clientRoles)
      ? (session.clientRoles as string[])
          .filter((r) => r.startsWith("neon:WORKBENCH:"))
          .map((r) => r.split(":")[2].toLowerCase())
          .filter((v): v is Workbench => isWorkbench(v))
      : [];

    return {
      workspaceResolutionState:
        session.workspaceResolutionState === "pending" ? "pending" : "resolved",
      currentWorkbench: (session.workbench as string | null) ?? null,
      allowedWorkbenches,
      csrfToken: (session.csrfToken as string) ?? "",
    } as const;
  } catch {
    return null;
  } finally {
    try { await redis?.quit(); } catch { /* ignore */ }
  }
}

/**
 * /workspace — dual-mode workspace chooser / switcher (C.5 + B.3)
 *
 * pending state  → heading "Choose your workspace"  (required step)
 * resolved state → heading "Switch workspace"        (optional switch)
 *
 * Protected: requires a session (enforced by shell layout session gate).
 * Allowed in both pending and resolved states (not redirected by D.3).
 */
export default async function WorkspacePage() {
  const data = await getSessionData();

  if (!data) {
    redirect("/login");
  }

  return (
    <WorkspaceClient
      resolutionState={data.workspaceResolutionState}
      currentWorkbench={data.currentWorkbench}
      allowedWorkbenches={data.allowedWorkbenches}
      csrfToken={data.csrfToken}
    />
  );
}
