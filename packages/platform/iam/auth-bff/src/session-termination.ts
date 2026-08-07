import {
  kcSessionReverseKey,
  realmKcSessionReverseKey,
  realmSubjectSessionsKey,
  sessKey,
  sidRotationKey,
  userSessionsKey,
  type SessionNamespace,
} from "@athyper/platform-iam-session-plane";
import type { createSessionRedisClient as createSessionRedisClientFn } from "@athyper/platform-iam-session-store";

export type SessionRedisClient = Awaited<ReturnType<typeof createSessionRedisClientFn>>;

export type SessionTerminationReason =
  | "manual_logout"
  | "idle_timeout"
  | "absolute_timeout"
  | "keycloak_backchannel_logout"
  | "admin_forced_logout"
  | "role_revoked"
  | "session_binding_mismatch";

export interface SessionTerminationContext {
  namespace: SessionNamespace | string;
  sid: string;
  userId?: string | undefined;
  keycloakSessionId?: string | undefined;
  realmKey?: string | undefined;
  reason?: SessionTerminationReason | string | undefined;
}

export interface SubjectCleanupResult {
  enabled: boolean;
  attempted: boolean;
  ok: boolean;
  status?: number;
  reason?: string;
}

/**
 * Delete one BFF session and all of its short-lived indexes.
 *
 * This is deliberately idempotent: logout, timeout, back-channel logout and
 * security invalidation can race without resurrecting or throwing on a missing
 * session. The Keycloak reverse index is cleaned here as well as by the
 * back-channel handler so normal logout does not leave stale membership.
 */
export async function terminateSession(
  redis: SessionRedisClient,
  context: SessionTerminationContext,
): Promise<void> {
  await redis.del(sessKey(context.namespace, context.sid)).catch(() => 0);
  await redis.del(sidRotationKey(context.namespace, context.sid)).catch(() => 0);
  await redis.del(`refresh_lock:${context.namespace}:${context.sid}`).catch(() => 0);

  if (context.userId && typeof redis.sRem === "function") {
    await redis.sRem(userSessionsKey(context.namespace, context.userId), context.sid).catch(() => 0);
    if (context.realmKey) {
      await redis.sRem(realmSubjectSessionsKey(context.realmKey, context.userId), `${context.namespace}:${context.sid}`).catch(() => 0);
    }
  }

  if (context.keycloakSessionId && typeof redis.sRem === "function") {
    const reverseKey = context.realmKey
      ? realmKcSessionReverseKey(context.realmKey, context.keycloakSessionId)
      : kcSessionReverseKey(context.keycloakSessionId);
    await redis.sRem(reverseKey, `${context.namespace}:${context.sid}`).catch(() => 0);
  }
}

/**
 * Remove every BFF session indexed for a subject across all supported planes.
 * This is used by explicit logout/timeout policy, not by ordinary session
 * context mutations.
 */
export async function terminateSubjectSessions(
  redis: SessionRedisClient,
  userId: string,
  realmKey?: string,
): Promise<number> {
  if (typeof redis.sMembers !== "function") {
    return 0;
  }

  const namespaces = ["neon", "mesh", "admin", "platform"] as const;
  let deleted = 0;

  const realms = realmKey ? [realmKey] : ["athyper", "platform-control"];
  for (const realm of realms) {
    const realmIndex = realmSubjectSessionsKey(realm, userId);
    const entries = await redis.sMembers(realmIndex).catch(() => [] as string[]);
    for (const entry of entries) {
      const separator = entry.indexOf(":");
      if (separator < 1) continue;
      const namespace = entry.slice(0, separator);
      const sid = entry.slice(separator + 1);
      await redis.del(sessKey(namespace, sid)).catch(() => 0);
      deleted++;
    }
    await redis.del(realmIndex).catch(() => 0);
  }

  // Compatibility cleanup for sessions created before realm-scoped indexes.
  for (const namespace of namespaces) {
    const indexKey = userSessionsKey(namespace, userId);
    const sids = await redis.sMembers(indexKey).catch(() => [] as string[]);
    if (sids.length > 0) {
      await redis.del(sids.map((sid) => sessKey(namespace, sid))).catch(() => 0);
      deleted += sids.length;
    }
    await redis.del(indexKey).catch(() => 0);
  }

  return deleted;
}

function subjectCleanupEnabled(): boolean {
  return (process.env.AUTH_SUBJECT_CLEANUP_ENABLED ?? "on").toLowerCase() === "on";
}

/**
 * Tell the runtime IAM service to clear effective-session, bootstrap, MFA and
 * cross-plane caches. The endpoint remains best-effort: local BFF deletion and
 * Keycloak termination must continue even when the runtime is unavailable.
 */
export async function notifyIamSubjectCleanup(args: {
  accessToken?: string | undefined;
  subjectId: string;
  planeKey: "admin" | "neon" | "mesh";
  realmKey: string;
  sessionId?: string | undefined;
  reason: SessionTerminationReason | string;
  requestId: string;
  auditContext?: unknown;
}): Promise<SubjectCleanupResult> {
  if (!subjectCleanupEnabled()) {
    return { enabled: false, attempted: false, ok: false, reason: "feature_disabled" };
  }

  const runtimeUrl = process.env.RUNTIME_API_URL?.replace(/\/+$/, "");
  if (!runtimeUrl || !args.accessToken) {
    return { enabled: true, attempted: false, ok: false, reason: "missing_runtime_or_token" };
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${args.accessToken}`,
      "X-Request-ID": args.requestId,
      "X-Logout-Reason": args.reason,
      "X-Logout-Subject": args.subjectId,
      "X-Plane-Key": args.planeKey,
      "X-Realm-Key": args.realmKey,
    };
    if (args.sessionId) headers["X-Session-ID"] = args.sessionId;
    if (args.auditContext) {
      headers["X-Logout-Context"] = Buffer.from(JSON.stringify(args.auditContext), "utf8").toString("base64url");
    }

    const response = await fetch(`${runtimeUrl}/api/session`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(1_500),
    });
    return {
      enabled: true,
      attempted: true,
      ok: response.ok,
      status: response.status,
      ...(response.ok ? {} : { reason: `iam_cleanup_failed:${response.status}` }),
    };
  } catch (error) {
    return {
      enabled: true,
      attempted: true,
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
