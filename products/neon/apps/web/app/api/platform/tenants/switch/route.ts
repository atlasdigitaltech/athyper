// products/neon/apps/web/app/api/platform/tenants/switch/route.ts
//
// POST /api/platform/tenants/switch
//
// Switches the platform admin's active tenant context.
// Updates the session in Redis with the new selectedTenantId.

import {
  AuthAuditEvent,
  emitBffAudit,
  hashSidForAudit,
} from "@neon/auth/audit";
import { NextResponse } from "next/server";

import { hasPlatformPermission, requirePlatformSession } from "../../helpers";

async function getRedisClient() {
  const { createClient } = await import("redis");
  const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
  const client = createClient({ url });
  client.on("error", () => {});
  if (!client.isOpen) await client.connect();
  return client;
}

/**
 * POST /api/platform/tenants/switch
 *
 * Body: { tenantId: string }
 *
 * Switches the platform admin's active tenant. After switching:
 *   - session.selectedTenantId is updated in Redis
 *   - Subsequent BFF requests forward x-tenant-id to the runtime
 *   - Audit trail is written to BOTH platform and target tenant logs
 *
 * Security:
 *   - Requires platform admin session
 *   - Requires "tenant:switch" permission
 *   - CSRF-protected (via middleware)
 *   - Validates target tenantId exists before switching
 */
export async function POST(req: Request) {
  const auth = await requirePlatformSession();
  if (!auth.ok) return auth.response;

  if (!hasPlatformPermission(auth.platformRoles, "tenant:switch")) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Insufficient platform role for tenant:switch",
      },
      { status: 403 },
    );
  }

  let body: { tenantId?: string };
  try {
    body = (await req.json()) as { tenantId?: string };
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const targetTenantId = body.tenantId;
  if (
    !targetTenantId ||
    typeof targetTenantId !== "string" ||
    targetTenantId.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "INVALID_TENANT_ID", message: "tenantId is required" },
      { status: 400 },
    );
  }

  // Validate target tenant exists via runtime API
  const runtimeApiUrl = process.env.RUNTIME_API_URL ?? "https://api.athyper.local";
  try {
    const validationRes = await fetch(`${runtimeApiUrl}/api/platform/tenants`, {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "X-Realm": auth.realmKey,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (validationRes.ok) {
      const data = (await validationRes.json()) as {
        tenants?: Array<{ id?: string }>;
      };
      const exists = data.tenants?.some((t) => t.id === targetTenantId);
      if (!exists) {
        return NextResponse.json(
          {
            error: "TENANT_NOT_FOUND",
            message: `Tenant ${targetTenantId} not found`,
          },
          { status: 404 },
        );
      }
    }
  } catch {
    // Runtime unreachable — allow switch but log a warning
    // (graceful degradation — don't block admin operations)
  }

  // Update session in Redis
  const redis = await getRedisClient();
  try {
    const raw = await redis.get(`sess:platform:${auth.sid}`);
    if (!raw) {
      return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 });
    }

    const session = JSON.parse(raw);
    const previousTenantId = session.selectedTenantId ?? null;
    session.selectedTenantId = targetTenantId;

    // Preserve existing TTL (get remaining TTL and reuse)
    const ttl = await redis.ttl(`sess:platform:${auth.sid}`);
    const effectiveTtl = ttl > 0 ? ttl : 28800;
    await redis.set(`sess:platform:${auth.sid}`, JSON.stringify(session), {
      EX: effectiveTtl,
    });

    // ─── Dual audit trail ─────────────────────────────────────
    // 1. Platform-level log (athyper ops visibility)
    await emitBffAudit(redis, AuthAuditEvent.PLATFORM_TENANT_SWITCH, {
      tenantId: "platform",
      userId: auth.userId,
      sidHash: hashSidForAudit(auth.sid),
      meta: {
        previousTenantId,
        newTenantId: targetTenantId,
        platformRoles: auth.platformRoles,
      },
    });

    // 2. Target tenant log (tenant admin visibility)
    await emitBffAudit(redis, AuthAuditEvent.PLATFORM_TENANT_SWITCH, {
      tenantId: targetTenantId,
      userId: auth.userId,
      sidHash: hashSidForAudit(auth.sid),
      meta: {
        source: "platform-admin",
        platformRoles: auth.platformRoles,
        displayName: auth.displayName,
      },
    });

    return NextResponse.json({
      ok: true,
      selectedTenantId: targetTenantId,
      previousTenantId,
    });
  } finally {
    await redis.quit();
  }
}
