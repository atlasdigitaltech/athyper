import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import type { V4Session } from "@athyper/platform-iam-auth-bff";
import { loadDocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import {
  createDocumentEditRedisClient,
  type DocumentEditRedisClient,
} from "@/lib/server/document-edit-runtime-redis";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";

const CANDIDATE_TTL_MS = 5 * 60_000;
const DEFAULT_TTL_MS = 60_000;
const ADDRESS_CACHE_MAX_ENTRIES = 500;
const REDIS_LOCK_TTL_MS = 5_000;
const REDIS_LOCK_WAIT_MS = 1_500;
const REDIS_LOCK_POLL_MS = 75;
const REDIS_WARNING_INTERVAL_MS = 60_000;

interface OwnerRef {
  ownerType: string;
  ownerId: string;
}

interface AddressCandidate {
  address_id: string;
  purpose: string;
  is_primary: boolean | null;
  code: string | null;
  name: string | null;
  line1: string | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
  formatted_address: string | null;
  tax_jurisdiction_id: string | null;
  jurisdiction_name: string | null;
  jurisdiction_code: string | null;
}

interface AddressDefaultPick {
  address_id: string;
  tax_jurisdiction_id: string | null;
  owner_type: string | null;
  owner_id: string | null;
  purpose: string | null;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

type AddressCacheHit = "memory" | "redis" | "db";

interface CoalescedAddressResult {
  value: unknown;
  cacheHit: AddressCacheHit;
}

const addressCache = new Map<string, CacheEntry>();
const addressInflight = new Map<string, Promise<CoalescedAddressResult>>();
let redisWarningLastAt = 0;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "read",
    unauthenticatedMessage: "Sign in again to load document addresses.",
  });
  if (!loaded.ok) return loaded.response;
  const { session } = loaded.context;

  const body = await readJson(request);
  const type = isRecord(body) && body["type"] === "default" ? "default" : "candidates";
  const ownerWalk = readOwnerWalk(isRecord(body) ? body["ownerWalk"] : undefined);
  const purposeChain = readStringArray(isRecord(body) ? body["purposeChain"] : undefined);
  if (ownerWalk.length === 0 || purposeChain.length === 0) {
    return NextResponse.json(
      { error: "INVALID_ADDRESS_REQUEST", message: "ownerWalk and purposeChain are required." },
      { status: 400 },
    );
  }

  const cacheKey = buildAddressCacheKey(session, type, ownerWalk, purposeChain);
  const ttlMs = type === "default" ? DEFAULT_TTL_MS : CANDIDATE_TTL_MS;
  const startedAt = Date.now();
  const result = await loadCoalesced(cacheKey, ttlMs, async () => {
    if (type === "default") {
      return fetchAddressDefault(session, ownerWalk, purposeChain);
    }
    return fetchAddressCandidates(session, ownerWalk, purposeChain);
  });
  const serverMs = Math.max(0, Date.now() - startedAt);

  return NextResponse.json(
    {
      ok: true,
      type,
      data: result.value,
      timing: {
        serverMs,
        cacheHit: result.cacheHit,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Document-Edit-Cache": result.cacheHit,
        "X-Document-Edit-Server-Ms": String(serverMs),
      },
    },
  );
}

async function loadCoalesced(
  cacheKey: string,
  ttlMs: number,
  loader: () => Promise<unknown>,
): Promise<CoalescedAddressResult> {
  const cached = addressCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { value: cached.value, cacheHit: "memory" };
  }

  const inflight = addressInflight.get(cacheKey);
  if (inflight) return inflight;

  const request: Promise<CoalescedAddressResult> = (async (): Promise<CoalescedAddressResult> => {
    const redis = await getAddressRedisClient();
    if (redis) {
      const redisHit = await readRedisAddressCache(redis, cacheKey);
      if (redisHit.hit) {
        rememberInProcess(cacheKey, ttlMs, redisHit.value);
        return { value: redisHit.value, cacheHit: "redis" };
      }

      const lockToken = randomUUID();
      const lockAcquired = await acquireRedisAddressLock(redis, cacheKey, lockToken);
      if (!lockAcquired) {
        const waitedHit = await waitForRedisAddressCache(redis, cacheKey, REDIS_LOCK_WAIT_MS);
        if (waitedHit.hit) {
          rememberInProcess(cacheKey, ttlMs, waitedHit.value);
          return { value: waitedHit.value, cacheHit: "redis" };
        }
      } else {
        try {
          const value = await loader();
          await writeRedisAddressCache(redis, cacheKey, ttlMs, value);
          rememberInProcess(cacheKey, ttlMs, value);
          return { value, cacheHit: "db" };
        } finally {
          await releaseRedisAddressLock(redis, cacheKey, lockToken);
        }
      }
    }

    const value = await loader();
    if (redis) await writeRedisAddressCache(redis, cacheKey, ttlMs, value);
    rememberInProcess(cacheKey, ttlMs, value);
    return { value, cacheHit: "db" };
  })();

  addressInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    addressInflight.delete(cacheKey);
  }
}

type RedisCacheRead =
  | { hit: true; value: unknown }
  | { hit: false };

async function getAddressRedisClient(): Promise<DocumentEditRedisClient | null> {
  try {
    return await createDocumentEditRedisClient({ logPrefix: "[document-edit/address/redis]" });
  } catch (error) {
    const now = Date.now();
    if (now - redisWarningLastAt > REDIS_WARNING_INTERVAL_MS) {
      redisWarningLastAt = now;
      console.warn("[document-edit/address] redis unavailable; using in-process cache", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

async function readRedisAddressCache(
  redis: DocumentEditRedisClient,
  cacheKey: string,
): Promise<RedisCacheRead> {
  try {
    const raw = await redis.get(cacheKey);
    if (!raw) return { hit: false };
    const parsed = JSON.parse(raw) as { value?: unknown };
    return Object.prototype.hasOwnProperty.call(parsed, "value")
      ? { hit: true, value: parsed.value }
      : { hit: false };
  } catch {
    return { hit: false };
  }
}

async function writeRedisAddressCache(
  redis: DocumentEditRedisClient,
  cacheKey: string,
  ttlMs: number,
  value: unknown,
): Promise<void> {
  try {
    await redis.set(cacheKey, JSON.stringify({ value }), {
      EX: Math.max(1, Math.ceil(ttlMs / 1000)),
    });
  } catch {
    // In-process cache remains the fallback; do not fail the document UI because
    // the shared cache is temporarily unavailable.
  }
}

async function acquireRedisAddressLock(
  redis: DocumentEditRedisClient,
  cacheKey: string,
  token: string,
): Promise<boolean> {
  try {
    const result = await redis.set(redisLockKey(cacheKey), token, {
      PX: REDIS_LOCK_TTL_MS,
      NX: true,
    });
    return result === "OK";
  } catch {
    return false;
  }
}

async function releaseRedisAddressLock(
  redis: DocumentEditRedisClient,
  cacheKey: string,
  token: string,
): Promise<void> {
  try {
    const lockKey = redisLockKey(cacheKey);
    const current = await redis.get(lockKey);
    if (current === token) await redis.del(lockKey);
  } catch {
    // Lock expires naturally.
  }
}

async function waitForRedisAddressCache(
  redis: DocumentEditRedisClient,
  cacheKey: string,
  waitMs: number,
): Promise<RedisCacheRead> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await delay(REDIS_LOCK_POLL_MS);
    const hit = await readRedisAddressCache(redis, cacheKey);
    if (hit.hit) return hit;
  }
  return { hit: false };
}

function rememberInProcess(cacheKey: string, ttlMs: number, value: unknown): void {
  pruneAddressCache();
  addressCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
}

function redisLockKey(cacheKey: string): string {
  return `${cacheKey}:lock`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneAddressCache(): void {
  if (addressCache.size < ADDRESS_CACHE_MAX_ENTRIES) return;

  const now = Date.now();
  for (const [key, entry] of addressCache.entries()) {
    if (entry.expiresAt <= now) addressCache.delete(key);
  }

  while (addressCache.size >= ADDRESS_CACHE_MAX_ENTRIES) {
    const oldest = addressCache.keys().next().value;
    if (typeof oldest !== "string") break;
    addressCache.delete(oldest);
  }
}

async function fetchAddressCandidates(
  session: V4Session,
  ownerWalk: OwnerRef[],
  purposeChain: string[],
): Promise<AddressCandidate[]> {
  const all: AddressCandidate[] = [];
  const purposesCsv = purposeChain.join(",");
  const headers = buildRuntimeHeaders(session);

  for (const owner of ownerWalk) {
    const response = await fetch(
      buildRuntimeUrl(
        `/api/master/addresses/candidates`
          + `?owner_type=${encodeURIComponent(owner.ownerType)}`
          + `&owner_id=${encodeURIComponent(owner.ownerId)}`
          + `&purposes=${encodeURIComponent(purposesCsv)}`,
      ),
      { headers, cache: "no-store" },
    );
    if (!response.ok) continue;
    const body = await readJson(response) as { data?: AddressCandidate[] } | null;
    all.push(...(body?.data ?? []));
  }

  return uniqueAddressCandidates(all);
}

async function fetchAddressDefault(
  session: V4Session,
  ownerWalk: OwnerRef[],
  purposeChain: string[],
): Promise<AddressDefaultPick | null> {
  const response = await fetch(
    buildRuntimeUrl("/api/master/addresses/default"),
    {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        owner_walk: ownerWalk.map((owner) => ({
          owner_type: owner.ownerType,
          owner_id: owner.ownerId,
        })),
        purposes: purposeChain,
      }),
    },
  );
  if (!response.ok) return null;

  const body = await readJson(response) as { data?: AddressDefaultPick | null } | null;
  return body?.data ?? null;
}

function buildAddressCacheKey(
  session: V4Session,
  type: "candidates" | "default",
  ownerWalk: OwnerRef[],
  purposeChain: string[],
): string {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const payload = JSON.stringify({
    type,
    planeKey: session.planeKey,
    realmKey: session.realmKey,
    activeOrg: session.activeOrg,
    activeWorkbench: session.activeWorkbench,
    contextType: membership?.contextType,
    legalEntityId: membership?.legalEntityId,
    organizationId: membership?.organizationId,
    roles: [...new Set(membership?.roles ?? [])].sort(),
    tenantId: membership?.tenantId,
    userId: session.userId,
    ownerWalk,
    purposeChain,
  });
  return `edit:address:v1:${createHash("sha256").update(payload).digest("base64url")}`;
}

function readOwnerWalk(value: unknown): OwnerRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const ownerType = readNonBlankString(item["ownerType"]);
      const ownerId = readNonBlankString(item["ownerId"]);
      return ownerType && ownerId ? { ownerType, ownerId } : null;
    })
    .filter((item): item is OwnerRef => item !== null);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const normalized = readNonBlankString(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function readJson(input: Request | Response): Promise<unknown> {
  try {
    return await input.json() as unknown;
  } catch {
    return null;
  }
}

function uniqueAddressCandidates(rows: AddressCandidate[]): AddressCandidate[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.address_id)) return false;
    seen.add(row.address_id);
    return true;
  });
}

function readNonBlankString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
