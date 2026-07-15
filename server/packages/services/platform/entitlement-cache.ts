/**
 * Versioned entitlement cache
 *
 * Two-key pattern (same as ref-cache.ts) — no wildcard DEL needed.
 *
 *   ent_ver:{tenantId}           → integer version counter
 *   ent:{tenantId}:v{version}    → JSON-serialised effective entitlement, TTL 3600s
 *
 *   plan_tenants:{planCode}      → JSON array of tenantIds on that plan, TTL 3600s
 *                                  (invalidated when plan access tables change)
 *
 * invalidateTenantEntitlement() — call after any access-table mutation for this tenant.
 * invalidatePlanTenants()       — call after plan-level version create / access changes.
 * getEffectiveEntitlement() / setEffectiveEntitlement() — used by read handlers.
 */

import type { RedisClient } from "@athyper/adapter-memory-cache";

const ENT_TTL_SECONDS = 3600;

export async function invalidateTenantEntitlement(redis: RedisClient, tenantId: string): Promise<void> {
  await redis.incr(`ent_ver:${tenantId}`);
}

export async function invalidatePlanTenants(redis: RedisClient, planCode: string): Promise<void> {
  await redis.del(`plan_tenants:${planCode}`);
}

export async function getEffectiveEntitlement<T>(redis: RedisClient, tenantId: string): Promise<T | null> {
  const ver = await redis.get(`ent_ver:${tenantId}`);
  if (!ver) return null;
  const raw = await redis.get(`ent:${tenantId}:v${ver}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function setEffectiveEntitlement<T>(redis: RedisClient, tenantId: string, data: T): Promise<void> {
  const ver = await redis.incr(`ent_ver:${tenantId}`);
  await redis.set(`ent:${tenantId}:v${ver}`, JSON.stringify(data), "EX", ENT_TTL_SECONDS);
}

export async function getPlanTenants(redis: RedisClient, planCode: string): Promise<string[] | null> {
  const raw = await redis.get(`plan_tenants:${planCode}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

export async function setPlanTenants(redis: RedisClient, planCode: string, tenantIds: string[]): Promise<void> {
  await redis.set(`plan_tenants:${planCode}`, JSON.stringify(tenantIds), "EX", ENT_TTL_SECONDS);
}

