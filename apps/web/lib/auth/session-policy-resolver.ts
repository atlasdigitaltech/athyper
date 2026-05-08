import "server-only";

import {
  CLIENT_REFRESH_BEFORE_EXPIRY_SECONDS,
  DEFAULT_PUBLIC_SESSION_POLICY,
  IDLE_TIMEOUT_SECONDS,
  IDLE_WARNING_SECONDS,
  REFRESH_LOCK_TTL_SECONDS,
  REFRESH_LOCK_WAIT_MS,
  REFRESH_ROTATION_GRACE_SECONDS,
  SERVER_REFRESH_BUFFER_SECONDS,
  SESSION_TTL_SECONDS,
  type PublicSessionPolicy,
} from "@/lib/auth/session-policy";
import type { V4Session } from "@/lib/auth/types";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

export interface ResolvedSessionPolicy extends PublicSessionPolicy {
  sessionTtlSeconds: number;
  serverRefreshBufferSeconds: number;
  refreshLockTtlSeconds: number;
  refreshLockWaitMs: number;
  refreshRotationGraceSeconds: number;
}

export const DEFAULT_RESOLVED_SESSION_POLICY: ResolvedSessionPolicy = {
  ...DEFAULT_PUBLIC_SESSION_POLICY,
  sessionTtlSeconds: SESSION_TTL_SECONDS,
  serverRefreshBufferSeconds: SERVER_REFRESH_BUFFER_SECONDS,
  refreshLockTtlSeconds: REFRESH_LOCK_TTL_SECONDS,
  refreshLockWaitMs: REFRESH_LOCK_WAIT_MS,
  refreshRotationGraceSeconds: REFRESH_ROTATION_GRACE_SECONDS,
};

interface RuntimeParameterSnapshot {
  values?: Record<string, unknown>;
}

const CACHE_TTL_MS = 30_000;
const policyCache = new Map<string, { expiresAt: number; policy: ResolvedSessionPolicy }>();

export async function resolveSessionPolicy(
  session: V4Session | null | undefined,
): Promise<ResolvedSessionPolicy> {
  if (!session?.activeOrg || !session.accessToken) {
    return DEFAULT_RESOLVED_SESSION_POLICY;
  }

  const cacheKey = `${session.realmKey}:${session.activeOrg}`;
  const cached = policyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.policy;

  try {
    const res = await fetch(`${RUNTIME_API_URL}/api/iam/parameters/effective?namespace=auth`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return DEFAULT_RESOLVED_SESSION_POLICY;

    const snapshot = (await res.json()) as RuntimeParameterSnapshot;
    const values = snapshot.values ?? {};
    const policy: ResolvedSessionPolicy = {
      sessionTtlSeconds: numberValue(values, "auth.session.absolute_ttl_seconds", SESSION_TTL_SECONDS),
      idleTimeoutSeconds: numberValue(values, "auth.idle.timeout_seconds", IDLE_TIMEOUT_SECONDS),
      idleWarningSeconds: numberValue(values, "auth.idle.warning_seconds", IDLE_WARNING_SECONDS),
      heartbeatIntervalMs: numberValue(values, "auth.heartbeat.interval_ms", DEFAULT_PUBLIC_SESSION_POLICY.heartbeatIntervalMs),
      clientRefreshBeforeExpirySeconds: numberValue(values, "auth.token.client_refresh_lead_seconds", CLIENT_REFRESH_BEFORE_EXPIRY_SECONDS),
      serverRefreshBufferSeconds: numberValue(values, "auth.token.server_refresh_buffer_seconds", SERVER_REFRESH_BUFFER_SECONDS),
      refreshLockTtlSeconds: numberValue(values, "auth.refresh.lock_ttl_seconds", REFRESH_LOCK_TTL_SECONDS),
      refreshLockWaitMs: numberValue(values, "auth.refresh.lock_wait_ms", REFRESH_LOCK_WAIT_MS),
      refreshRotationGraceSeconds: numberValue(values, "auth.refresh.sid_rotation_grace_seconds", REFRESH_ROTATION_GRACE_SECONDS),
      sessionExpiredRedirectCountdownSeconds: numberValue(
        values,
        "auth.session.expired_redirect_countdown_seconds",
        DEFAULT_PUBLIC_SESSION_POLICY.sessionExpiredRedirectCountdownSeconds,
      ),
      mfaPendingTtlSeconds: numberValue(values, "auth.mfa.pending_ttl_seconds", DEFAULT_PUBLIC_SESSION_POLICY.mfaPendingTtlSeconds),
      trustedDeviceTtlDays: numberValue(values, "auth.mfa.trusted_device_ttl_days", DEFAULT_PUBLIC_SESSION_POLICY.trustedDeviceTtlDays),
    };

    policyCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, policy });
    return policy;
  } catch {
    return DEFAULT_RESOLVED_SESSION_POLICY;
  }
}

function numberValue(values: Record<string, unknown>, code: string, fallback: number): number {
  const raw = values[code];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
