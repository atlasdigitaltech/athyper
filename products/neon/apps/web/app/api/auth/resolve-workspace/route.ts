import { hashSidForAudit } from "@neon/auth/audit";
import { getSessionId } from "@neon/auth/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { validateReturnUrl } from "@/lib/auth/validate-return-url";
import { isWorkbench, type Workbench } from "@/lib/auth/types";
import { WORKBENCH_CONFIGS } from "@/lib/auth/workbench-config";
import { emitWorkspaceEvent } from "@/lib/auth/workspace-telemetry";
import { getSessionRedis } from "@/lib/auth/session-redis";

/**
 * POST /api/auth/resolve-workspace
 *
 * Single authoritative workspace resolver. Called by /auth/resolving after login.
 *
 * Decision order:
 *   1. Validate + honour returnUrl (entitlement check via validateReturnUrl)
 *   2. Validate + honour lastUsedWorkbench (must be in allowedWorkbenches)
 *   3. Auto-route if exactly one workbench is allowed
 *   4. Return { decision: "chooser_required" } — client navigates to /workspace
 *   5. Return { decision: "denied" } — no allowed workbenches (403)
 *
 * Idempotent: if the session is already resolved to the same workbench,
 * returns the same redirect without re-writing Redis or re-emitting telemetry.
 *
 * Different workbench when already resolved: returns { decision: "switch_required" }
 * so the caller can navigate to /workspace for an explicit switch via C.2.
 *
 * Body: { returnUrl?: string; lastUsedWorkbench?: string }
 *
 * This endpoint is CSRF-exempt: it is the first call after callback and the
 * CSRF cookie is already set by the callback before this is reached.
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

  const redis = await getSessionRedis();

  const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 401 });
    }

    const session = JSON.parse(raw) as Record<string, unknown>;

    const userId = session.userId as string;
    const tenantId = session.tenantId as string ?? sessionNamespace;
    const sidHash = hashSidForAudit(sid);
    const allowedWorkbenches: Workbench[] = Array.isArray(session.clientRoles)
      ? (session.clientRoles as string[])
          .filter((r) => r.startsWith("neon:WORKBENCH:"))
          .map((r) => r.split(":")[2].toLowerCase())
          .filter((v): v is Workbench => isWorkbench(v))
      : [];

    const resolutionStateBefore: "pending" | "resolved" =
      session.workspaceResolutionState === "pending" ? "pending" : "resolved";

    // Emit resolution_started
    await emitWorkspaceEvent(redis, {
      event: "workspace.resolution_started",
      userId,
      tenantId,
      sidHash,
      allowedWorkbenches,
      success: true,
      resolutionStateBefore,
    });

    let body: { returnUrl?: string; lastUsedWorkbench?: string } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      // empty body is fine
    }

    const { returnUrl, lastUsedWorkbench } = body;

    // ── Idempotency check ────────────────────────────────────────
    // If already resolved to a workbench, returning the same answer
    // is safe. A different workbench requires an explicit switch.
    if (resolutionStateBefore === "resolved" && session.workbench) {
      const currentWb = session.workbench as string;
      const requestedWb =
        returnUrl
          ? (validateReturnUrl(returnUrl, allowedWorkbenches).valid
              ? (validateReturnUrl(returnUrl, allowedWorkbenches) as { workbench: Workbench | null }).workbench
              : null)
          : null;

      const targetWb = requestedWb ?? (lastUsedWorkbench && isWorkbench(lastUsedWorkbench) ? lastUsedWorkbench : null);

      if (!targetWb || targetWb === currentWb) {
        // Same workbench — idempotent, return existing redirect without re-emit
        const redirect = returnUrl ?? WORKBENCH_CONFIGS[currentWb as Workbench]?.defaultRoute ?? "/workspace";
        return NextResponse.json({ redirect });
      }

      // Different workbench requested while already resolved → structured response
      return NextResponse.json({ decision: "switch_required" });
    }

    // ── Step 1: validate + honour returnUrl ──────────────────────
    if (returnUrl) {
      const result = validateReturnUrl(returnUrl, allowedWorkbenches);
      if (result.valid) {
        const wb = result.workbench ?? (allowedWorkbenches[0] as Workbench | undefined);
        if (wb) {
          await finalizeSession(redis, sessionNamespace, sid, session, wb);
          await emitWorkspaceEvent(redis, {
            event: "workspace.resolved",
            userId,
            tenantId,
            sidHash,
            allowedWorkbenches,
            finalWorkbench: wb,
            source: "return_url",
            requestedReturnUrl: returnUrl,
            finalPath: returnUrl,
            success: true,
            latencyMs: Date.now() - startMs,
            resolutionStateBefore,
          });
          return NextResponse.json({ redirect: returnUrl });
        }
      } else if (result.reason === "entitlement_denied") {
        // Emit E.4 rejection telemetry then fall through
        await emitWorkspaceEvent(redis, {
          event: "workspace.resolution_failed",
          userId,
          tenantId,
          sidHash,
          allowedWorkbenches,
          source: "return_url",
          rejectedReturnUrl: returnUrl,
          requestedReturnUrl: returnUrl,
          success: false,
          latencyMs: Date.now() - startMs,
          resolutionStateBefore,
        });
      }
      // unsafe_family or not_internal — fall through silently
    }

    // ── Step 2: validate + honour lastUsedWorkbench ──────────────
    if (lastUsedWorkbench && isWorkbench(lastUsedWorkbench) && allowedWorkbenches.includes(lastUsedWorkbench)) {
      await finalizeSession(redis, sessionNamespace, sid, session, lastUsedWorkbench);
      const defaultRoute = WORKBENCH_CONFIGS[lastUsedWorkbench].defaultRoute;
      await emitWorkspaceEvent(redis, {
        event: "workspace.resolved",
        userId,
        tenantId,
        sidHash,
        allowedWorkbenches,
        finalWorkbench: lastUsedWorkbench,
        source: "last_used",
        finalPath: defaultRoute,
        success: true,
        latencyMs: Date.now() - startMs,
        resolutionStateBefore,
      });
      return NextResponse.json({ redirect: defaultRoute });
    }

    // ── Step 3: auto-route if exactly one workbench ──────────────
    if (allowedWorkbenches.length === 1) {
      const wb = allowedWorkbenches[0];
      await finalizeSession(redis, sessionNamespace, sid, session, wb);
      const defaultRoute = WORKBENCH_CONFIGS[wb].defaultRoute;
      await emitWorkspaceEvent(redis, {
        event: "workspace.resolved",
        userId,
        tenantId,
        sidHash,
        allowedWorkbenches,
        finalWorkbench: wb,
        source: "single_allowed",
        finalPath: defaultRoute,
        success: true,
        latencyMs: Date.now() - startMs,
        resolutionStateBefore,
      });
      return NextResponse.json({ redirect: defaultRoute });
    }

    // ── Step 4: chooser required ─────────────────────────────────
    if (allowedWorkbenches.length > 1) {
      return NextResponse.json({
        decision: "chooser_required",
        allowedWorkbenches,
      });
    }

    // ── Step 5: denied — no allowed workbenches ──────────────────
    await emitWorkspaceEvent(redis, {
      event: "workspace.resolution_failed",
      userId,
      tenantId,
      sidHash,
      allowedWorkbenches,
      source: "denied",
      success: false,
      latencyMs: Date.now() - startMs,
      resolutionStateBefore,
    });
    return NextResponse.json({ decision: "denied" }, { status: 403 });
}

/**
 * Write the resolved workbench into the session and mark it as resolved.
 * Preserves the remaining TTL by reading it before the SET (KEEPTTL requires
 * Redis 6.0+; this approach is compatible with Redis 5.x and above).
 * Falls back to 8h if no TTL is set or the key is missing.
 */
async function finalizeSession(
  redis: Awaited<ReturnType<typeof getSessionRedis>>,
  namespace: string,
  sid: string,
  session: Record<string, unknown>,
  workbench: Workbench,
): Promise<void> {
  const key = `sess:${namespace}:${sid}`;
  const remainingTtl = await redis.ttl(key);
  // ttl() returns -1 (no expiry) or -2 (key gone); use 8h default in both cases
  const exSeconds = remainingTtl > 0 ? remainingTtl : 28800;

  const updated = {
    ...session,
    workbench,
    workspaceResolutionState: "resolved",
  };
  await redis.set(key, JSON.stringify(updated), { EX: exSeconds });
}
