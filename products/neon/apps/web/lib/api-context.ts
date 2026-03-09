/**
 * API context helpers for BFF routes
 *
 * Provides consistent tenant/user extraction from session for API routes.
 */

import { getSessionId } from "@neon/auth/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function getRedisClient(): Promise<{
  get: (key: string) => Promise<string | null>;
  del: (key: string | string[]) => Promise<number>;
  quit: () => Promise<void>;
  isOpen: boolean;
}> {
  const { createClient } = await import("redis");
  const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
  const client = createClient({ url });
  if (!client.isOpen) await client.connect();
  return client as any;
}

export interface ApiContext {
  tenantId: string;
  userId: string;
  username: string;
  displayName: string;
  workbench: string;
  roles: string[];
  persona: string | null;
}

export interface SessionData {
  tenantId?: string;
  userId: string;
  username: string;
  displayName: string;
  workbench: string;
  roles?: string[];
  persona?: string | null;
  ipHash?: string;
  uaHash?: string;
}

// ─── Tenant UUID Resolution ──────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TENANT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface TenantCacheEntry {
  uuid: string;
  expiresAt: number;
}

/**
 * Resolve tenant code to UUID via a one-shot pg query.
 * Cached per tenant code with a 5-minute TTL so DB resets are picked up
 * without restarting the server.
 */
const _tenantUuidByCode = new Map<string, TenantCacheEntry>();

async function resolveTenantIdFromDb(tenantCode: string): Promise<string> {
  if (UUID_RE.test(tenantCode)) return tenantCode;

  const cached = _tenantUuidByCode.get(tenantCode);
  if (cached && cached.expiresAt > Date.now()) return cached.uuid;

  if (!process.env.DATABASE_URL) return tenantCode; // no DB — return code as-is

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      "SELECT id FROM core.tenant WHERE code = $1 LIMIT 1",
      [tenantCode],
    );
    if (result.rows.length > 0) {
      const uuid: string = result.rows[0].id;
      _tenantUuidByCode.set(tenantCode, {
        uuid,
        expiresAt: Date.now() + TENANT_CACHE_TTL_MS,
      });
      return uuid;
    }
    console.error(
      `[getApiContext] No tenant found in core.tenant for code "${tenantCode}".`,
      `Set DEFAULT_TENANT_ID in .env.local to a valid tenant code (e.g. demo_my).`,
    );
    return tenantCode;
  } catch (err) {
    console.warn(
      "[getApiContext] Tenant UUID resolution failed, using code as-is:",
      err,
    );
    return tenantCode;
  } finally {
    await pool.end();
  }
}

/**
 * Extracts authenticated user context from session.
 *
 * tenantId in the returned context is resolved to the actual UUID from core.tenant
 * (when DATABASE_URL is available), ensuring compatibility with UUID-typed columns.
 *
 * @returns ApiContext if authenticated, null otherwise
 */
export async function getApiContext(): Promise<
  | { context: ApiContext; redis: Awaited<ReturnType<typeof getRedisClient>> }
  | { context: null; redis: Awaited<ReturnType<typeof getRedisClient>> }
> {
  const sid = await getSessionId();
  const redis = await getRedisClient();

  if (!sid) {
    return { context: null, redis };
  }

  // Check if this is a platform admin session (neon_realm cookie set by callback)
  const cookieStore = await cookies();
  const realmCookie = cookieStore.get("neon_realm")?.value;
  const isPlatform = realmCookie === "platform";

  // Determine Redis session namespace:
  // - Platform admins: sess:platform:{sid}
  // - Regular users: sess:{tenantCode}:{sid}
  const tenantCode = process.env.DEFAULT_TENANT_ID ?? "default";
  const sessionNamespace = isPlatform ? "platform" : tenantCode;

  try {
    const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) {
      return { context: null, redis };
    }

    const session: SessionData & { selectedTenantId?: string } =
      JSON.parse(raw);

    // For platform admins who have switched tenant, use selectedTenantId.
    // For regular users, use session.tenantId (resolved from JWT/groups at login).
    // Fall back to DEFAULT_TENANT_ID only if session has no tenant.
    const effectiveTenantCode =
      isPlatform && session.selectedTenantId
        ? session.selectedTenantId
        : (session.tenantId ?? tenantCode);

    // Resolve to UUID for DB queries (cached after first call)
    const tenantId = await resolveTenantIdFromDb(effectiveTenantCode);

    return {
      context: {
        tenantId,
        userId: session.userId,
        username: session.username,
        displayName: session.displayName,
        workbench: session.workbench,
        roles: session.roles ?? [],
        persona: session.persona ?? null,
      },
      redis,
    };
  } catch (err) {
    console.error("[getApiContext] Error parsing session:", err);
    return { context: null, redis };
  }
}

/** Process-level cache: tenant code → tenant UUID with TTL (for Kysely-based resolution) */
const tenantUuidCache = new Map<string, TenantCacheEntry>();

/**
 * Resolves a tenant code/slug (e.g. "default", "demo_my") to its UUID from `core.tenant`.
 * If the input is already a valid UUID, returns it as-is.
 * Results are cached with a 5-minute TTL so DB resets are picked up automatically.
 */
export async function resolveTenantUuid(
  db: { selectFrom: (table: string) => any },
  tenantCode: string,
): Promise<string> {
  // Already a UUID — pass through
  if (UUID_RE.test(tenantCode)) return tenantCode;

  // Check cache
  const cached = tenantUuidCache.get(tenantCode);
  if (cached && cached.expiresAt > Date.now()) return cached.uuid;

  // Query core.tenant
  const row = await db
    .selectFrom("core.tenant" as any)
    .select("id")
    .where("code", "=", tenantCode)
    .executeTakeFirst();

  const uuid = (row as any)?.id;
  if (!uuid) {
    throw new Error(
      `Tenant not found for code "${tenantCode}". Check DEFAULT_TENANT_ID env var and core.tenant seed data.`,
    );
  }

  tenantUuidCache.set(tenantCode, {
    uuid,
    expiresAt: Date.now() + TENANT_CACHE_TTL_MS,
  });
  return uuid;
}

// ─── Response Helpers ────────────────────────────────────────
//
// Delegates to the canonical helpers in api-response.ts.
// Existing routes can keep using these names — they produce the
// exact same { success, data } / { success, error } envelope.
//
// New routes should import directly from "@/lib/api-response".

import {
  ok,
  fail,
  unauthorized as _unauthorized,
  type PaginationMeta,
  paginated as _paginated,
  buildPaginationMeta,
  extractPagination,
  extractSort,
  extractSearch,
} from "@/lib/api-response";

// Re-export new helpers so routes can migrate incrementally
export {
  ok,
  fail,
  buildPaginationMeta,
  extractPagination,
  extractSort,
  extractSearch,
};
export type { PaginationMeta };

/**
 * Standard unauthorized response for API routes
 * @deprecated Use `unauthorized()` from "@/lib/api-response" instead
 */
export function unauthorizedResponse(message = "Unauthorized") {
  return _unauthorized(message);
}

/**
 * Standard error response for API routes
 * @deprecated Use `fail()` from "@/lib/api-response" instead
 */
export function errorResponse(code: string, message: string, status = 500) {
  return fail(code, message, status);
}

/**
 * Standard success response for API routes
 * @deprecated Use `ok()` from "@/lib/api-response" instead
 */
export function successResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>,
) {
  if (headers) {
    return NextResponse.json({ success: true, data } as const, { status, headers });
  }
  return ok(data, status);
}

/**
 * Standard paginated list response for API routes
 */
export function paginatedResponse<T>(
  data: T[],
  meta: PaginationMeta,
) {
  return _paginated(data, meta);
}
