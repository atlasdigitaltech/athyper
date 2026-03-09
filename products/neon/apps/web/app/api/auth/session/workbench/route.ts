import { hashSidForAudit } from "@neon/auth/audit";
import { getSessionId } from "@neon/auth/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isWorkbench, type Workbench } from "@/lib/auth/types";
import { WORKBENCH_CONFIGS } from "@/lib/auth/workbench-config";
import { emitWorkspaceEvent } from "@/lib/auth/workspace-telemetry";
import { getSessionRedis } from "@/lib/auth/session-redis";

/**
 * POST /api/auth/session/workbench
 *
 * Manual workspace activation. Called by the /workspace chooser/switcher
 * when the user explicitly picks a workbench.
 *
 * Callable in both pending and resolved states:
 *   - pending → initial workspace selection (chooser flow)
 *   - resolved → workspace switch (switcher flow)
 *
 * Validates the requested workbench against allowedWorkbenches derived from
 * the session's clientRoles (neon:WORKBENCH:* roles). Returns the default
 * route for the selected workbench on success.
 *
 * CSRF: protected by the standard double-submit cookie pattern in middleware.
 * Callers must send the x-csrf-token header.
 *
 * Body: { workbench: Workbench }
 */
export async function POST(req: Request) {
  const startMs = Date.now();
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const realmCookie = cookieStore.get("neon_realm")?.value;
  const sessionNamespace =
    realmCookie === "platform"
      ? "platform"
      : (process.env.DEFAULT_TENANT_ID ?? "default");

  let body: { workbench?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const { workbench: requested } = body;
  if (!requested || typeof requested !== "string" || !isWorkbench(requested)) {
    return NextResponse.json(
      { error: "INVALID_WORKBENCH", message: "workbench must be a valid Workbench value" },
      { status: 400 },
    );
  }

  const redis = await getSessionRedis();

  const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 401 });
    }

    const session = JSON.parse(raw) as Record<string, unknown>;

    const userId = session.userId as string;
    const tenantId = (session.tenantId as string) ?? sessionNamespace;
    const sidHash = hashSidForAudit(sid);
    const resolutionStateBefore: "pending" | "resolved" =
      session.workspaceResolutionState === "pending" ? "pending" : "resolved";

    // Derive allowed workbenches from clientRoles
    const allowedWorkbenches: Workbench[] = Array.isArray(session.clientRoles)
      ? (session.clientRoles as string[])
          .filter((r) => r.startsWith("neon:WORKBENCH:"))
          .map((r) => r.split(":")[2].toLowerCase())
          .filter((v): v is Workbench => isWorkbench(v))
      : [];

    if (!allowedWorkbenches.includes(requested)) {
      return NextResponse.json(
        { error: "ENTITLEMENT_DENIED", message: "You are not permitted to access this workbench" },
        { status: 403 },
      );
    }

    // Finalize the session with the chosen workbench.
    // Preserve remaining TTL (KEEPTTL requires Redis 6.0+; ttl() approach is
    // compatible with Redis 5.x and above).
    const sessionKey = `sess:${sessionNamespace}:${sid}`;
    const remainingTtl = await redis.ttl(sessionKey);
    const exSeconds = remainingTtl > 0 ? remainingTtl : 28800;

    const updated = {
      ...session,
      workbench: requested,
      workspaceResolutionState: "resolved",
    };
    await redis.set(sessionKey, JSON.stringify(updated), { EX: exSeconds });

    const source =
      resolutionStateBefore === "pending" ? "chooser_manual" : "switch_manual";
    const defaultRoute = WORKBENCH_CONFIGS[requested].defaultRoute;

    await emitWorkspaceEvent(redis, {
      event: "workspace.resolved",
      userId,
      tenantId,
      sidHash,
      allowedWorkbenches,
      finalWorkbench: requested,
      source,
      finalPath: defaultRoute,
      success: true,
      latencyMs: Date.now() - startMs,
      resolutionStateBefore,
    });

    return NextResponse.json({ success: true, redirect: defaultRoute });
}
