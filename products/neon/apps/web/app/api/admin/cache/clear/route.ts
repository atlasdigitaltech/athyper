import {
  AuthAuditEvent,
  emitBffAudit,
  hashSidForAudit,
} from "@neon/auth/audit";
import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

import {
  CACHE_PATTERNS,
  isValidScope,
  scanAndDelete,
} from "@/lib/diagnostics/cache-patterns";

async function getRedisClient() {
  const { createClient } = await import("redis");
  const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
  const client = createClient({ url });
  if (!client.isOpen) await client.connect();
  return client;
}

/**
 * POST /api/admin/cache/clear?scope=app|rbac
 *
 * Clears server-side caches by scanning Redis for matching key patterns.
 * - scope=app: clears cache:api:*, cache:dashboard:*, cache:config:*
 * - scope=rbac: clears rbac:*, policy:*, acl:*
 */
export async function POST(req: NextRequest) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = req.nextUrl.searchParams.get("scope");
  if (!scope || !isValidScope(scope)) {
    return NextResponse.json(
      {
        error: "Invalid scope",
        message: 'Query parameter "scope" must be "app" or "rbac"',
      },
      { status: 400 },
    );
  }

  const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
  const redis = await getRedisClient();

  try {
    const raw = await redis.get(`sess:${tenantId}:${sid}`);
    if (!raw) {
      return NextResponse.json({ error: "Session not found" }, { status: 401 });
    }

    const session = JSON.parse(raw);
    const patterns = CACHE_PATTERNS[scope];
    const keysDeleted = await scanAndDelete(redis, patterns);

    await emitBffAudit(redis, AuthAuditEvent.DIAG_CACHE_CLEAR, {
      tenantId,
      userId: session.userId,
      sidHash: hashSidForAudit(sid),
      meta: { scope, keysDeleted },
    });

    return NextResponse.json({ ok: true, scope, keysDeleted });
  } catch (err) {
    return NextResponse.json(
      { error: "Cache clear failed", message: String(err) },
      { status: 500 },
    );
  } finally {
    await redis.quit();
  }
}
