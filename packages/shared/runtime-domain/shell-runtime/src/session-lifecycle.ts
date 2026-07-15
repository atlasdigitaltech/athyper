"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPlaneConfig, SESSION_POLICY_DEFAULTS, type PlaneKey, type SessionPolicyDefaults } from "@athyper/session-plane";

export type FavoritesPanelTab = "bookmarks" | "recent";

export interface FavoritesPanelSlotProps {
  activeTab: FavoritesPanelTab;
  onTabChange: (tab: FavoritesPanelTab) => void;
  onClose: () => void;
}

export interface ActiveOrg {
  orgName: string;
  legalEntityName: string;
  tenantName: string;
  roles: string[];
}

export interface ActiveUser {
  displayName: string;
  initials: string;
}

interface SessionPayload {
  authenticated: true;
  activeOrg: string | null;
  organizations: Record<string, unknown>;
  accessExpiresAt: number;
  sessionPolicy?: unknown;
  displayName?: string;
  username?: string;
}

interface RefreshBody {
  ok?: boolean;
  accessExpiresAt?: number;
  sessionPolicy?: unknown;
  retryAfter?: number;
  redirect?: string;
  error?: string;
  message?: string;
}

interface SessionActivityMessage {
  type: "activity";
  at: number;
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

const CLIENT_SESSION_POLICY_BOUNDS = {
  absoluteTtlSeconds:              { min: 1_800,   max: 43_200  },
  pkceStateTtlSeconds:             { min: 300,     max: 3_600   },
  idleTimeoutSeconds:              { min: 300,     max: 3_600   },
  idleWarningSeconds:              { min: 30,      max: 600     },
  heartbeatIntervalMs:             { min: 60_000,  max: 600_000 },
  serverRefreshBufferSeconds:      { min: 60,      max: 600     },
  clientRefreshBeforeExpirySeconds:{ min: 30,      max: 300     },
  refreshLockTtlSeconds:           { min: 3,       max: 60      },
  refreshLockWaitMs:               { min: 50,      max: 2_000   },
  refreshRotationGraceSeconds:     { min: 5,       max: 120     },
  mfaPendingTtlSeconds:            { min: 300,     max: 1_800   },
  expiredRedirectCountdownSeconds: { min: 5,       max: 300     },
} as const;

const SESSION_POLICY_KEYS = [
  "absoluteTtlSeconds",
  "pkceStateTtlSeconds",
  "idleTimeoutSeconds",
  "idleWarningSeconds",
  "heartbeatIntervalMs",
  "serverRefreshBufferSeconds",
  "clientRefreshBeforeExpirySeconds",
  "refreshLockTtlSeconds",
  "refreshLockWaitMs",
  "refreshRotationGraceSeconds",
  "mfaPendingTtlSeconds",
  "expiredRedirectCountdownSeconds",
] as const satisfies readonly (keyof SessionPolicyDefaults)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    authenticated?: unknown;
    activeOrg?: unknown;
    organizations?: unknown;
    accessExpiresAt?: unknown;
  };
  return (
    candidate.authenticated === true &&
    (candidate.activeOrg === null || typeof candidate.activeOrg === "string") &&
    isRecord(candidate.organizations) &&
    typeof candidate.accessExpiresAt === "number"
  );
}

function isOrgPayload(value: unknown): value is {
  name: string;
  legalEntityName?: string;
  roles?: string[];
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { name?: unknown; legalEntityName?: unknown; roles?: unknown };
  return (
    typeof candidate.name === "string" &&
    (candidate.legalEntityName === undefined || typeof candidate.legalEntityName === "string") &&
    (candidate.roles === undefined || (Array.isArray(candidate.roles) && candidate.roles.every((role) => typeof role === "string")))
  );
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function activeUserFromSession(session: {
  displayName?: string;
  username?: string;
}): ActiveUser | null {
  const name = session.displayName ?? session.username;
  if (!name) return null;
  return { displayName: name, initials: toInitials(name) };
}

export function activeOrgFromSession(session: {
  activeOrg: string | null;
  organizations: Record<string, unknown>;
}): ActiveOrg | null {
  if (!session.activeOrg) return null;
  const membership = session.organizations[session.activeOrg];
  if (!isOrgPayload(membership)) return null;

  return {
    orgName: membership.name,
    legalEntityName: membership.legalEntityName ?? membership.name,
    tenantName: membership.name,
    roles: membership.roles ?? [],
  };
}

function normalizeClientSessionPolicy(value: unknown): SessionPolicyDefaults {
  const fallback = SESSION_POLICY_DEFAULTS;
  if (!isRecord(value)) return fallback;

  const serverRefreshBufferSeconds = boundedInt(
    value.serverRefreshBufferSeconds,
    fallback.serverRefreshBufferSeconds,
    CLIENT_SESSION_POLICY_BOUNDS.serverRefreshBufferSeconds.min,
    CLIENT_SESSION_POLICY_BOUNDS.serverRefreshBufferSeconds.max,
  );
  const clientRefreshBeforeExpirySeconds = Math.min(
    boundedInt(
      value.clientRefreshBeforeExpirySeconds,
      fallback.clientRefreshBeforeExpirySeconds,
      CLIENT_SESSION_POLICY_BOUNDS.clientRefreshBeforeExpirySeconds.min,
      CLIENT_SESSION_POLICY_BOUNDS.clientRefreshBeforeExpirySeconds.max,
    ),
    Math.max(CLIENT_SESSION_POLICY_BOUNDS.clientRefreshBeforeExpirySeconds.min, serverRefreshBufferSeconds - 1),
  );
  const idleTimeoutSeconds = boundedInt(
    value.idleTimeoutSeconds,
    fallback.idleTimeoutSeconds,
    CLIENT_SESSION_POLICY_BOUNDS.idleTimeoutSeconds.min,
    CLIENT_SESSION_POLICY_BOUNDS.idleTimeoutSeconds.max,
  );
  const idleWarningSeconds = Math.min(
    boundedInt(
      value.idleWarningSeconds,
      fallback.idleWarningSeconds,
      CLIENT_SESSION_POLICY_BOUNDS.idleWarningSeconds.min,
      CLIENT_SESSION_POLICY_BOUNDS.idleWarningSeconds.max,
    ),
    Math.max(CLIENT_SESSION_POLICY_BOUNDS.idleWarningSeconds.min, idleTimeoutSeconds - 30),
  );

  return {
    absoluteTtlSeconds: boundedInt(
      value.absoluteTtlSeconds, fallback.absoluteTtlSeconds,
      CLIENT_SESSION_POLICY_BOUNDS.absoluteTtlSeconds.min,
      CLIENT_SESSION_POLICY_BOUNDS.absoluteTtlSeconds.max,
    ),
    pkceStateTtlSeconds: boundedInt(
      value.pkceStateTtlSeconds, fallback.pkceStateTtlSeconds,
      CLIENT_SESSION_POLICY_BOUNDS.pkceStateTtlSeconds.min,
      CLIENT_SESSION_POLICY_BOUNDS.pkceStateTtlSeconds.max,
    ),
    idleTimeoutSeconds,
    idleWarningSeconds,
    heartbeatIntervalMs: boundedInt(
      value.heartbeatIntervalMs, fallback.heartbeatIntervalMs,
      CLIENT_SESSION_POLICY_BOUNDS.heartbeatIntervalMs.min,
      CLIENT_SESSION_POLICY_BOUNDS.heartbeatIntervalMs.max,
    ),
    serverRefreshBufferSeconds,
    clientRefreshBeforeExpirySeconds,
    refreshLockTtlSeconds: boundedInt(
      value.refreshLockTtlSeconds, fallback.refreshLockTtlSeconds,
      CLIENT_SESSION_POLICY_BOUNDS.refreshLockTtlSeconds.min,
      CLIENT_SESSION_POLICY_BOUNDS.refreshLockTtlSeconds.max,
    ),
    refreshLockWaitMs: boundedInt(
      value.refreshLockWaitMs, fallback.refreshLockWaitMs,
      CLIENT_SESSION_POLICY_BOUNDS.refreshLockWaitMs.min,
      CLIENT_SESSION_POLICY_BOUNDS.refreshLockWaitMs.max,
    ),
    refreshRotationGraceSeconds: boundedInt(
      value.refreshRotationGraceSeconds, fallback.refreshRotationGraceSeconds,
      CLIENT_SESSION_POLICY_BOUNDS.refreshRotationGraceSeconds.min,
      CLIENT_SESSION_POLICY_BOUNDS.refreshRotationGraceSeconds.max,
    ),
    mfaPendingTtlSeconds: boundedInt(
      value.mfaPendingTtlSeconds, fallback.mfaPendingTtlSeconds,
      CLIENT_SESSION_POLICY_BOUNDS.mfaPendingTtlSeconds.min,
      CLIENT_SESSION_POLICY_BOUNDS.mfaPendingTtlSeconds.max,
    ),
    expiredRedirectCountdownSeconds: boundedInt(
      value.expiredRedirectCountdownSeconds, fallback.expiredRedirectCountdownSeconds,
      CLIENT_SESSION_POLICY_BOUNDS.expiredRedirectCountdownSeconds.min,
      CLIENT_SESSION_POLICY_BOUNDS.expiredRedirectCountdownSeconds.max,
    ),
  };
}

function isSameSessionPolicy(a: SessionPolicyDefaults, b: SessionPolicyDefaults): boolean {
  return SESSION_POLICY_KEYS.every((key) => a[key] === b[key]);
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  return Math.min(max, Math.max(min, integer));
}

function activityStorageKey(plane: PlaneKey): string {
  return `athyper:${plane}:lastActivityAt`;
}

function activityChannelName(plane: PlaneKey): string {
  return `athyper:${plane}:session-activity`;
}

function readStoredActivity(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredActivity(key: string, at: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(at));
  } catch {
    // Private browsing and locked-down profiles can block storage.
  }
}

export function readCsrfToken(plane: PlaneKey): string {
  if (typeof document === "undefined") return "";
  const cookieName = getPlaneConfig(plane).csrfCookieName;
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return "";
  }
}

export function csrfFetch(plane: PlaneKey, input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readCsrfToken(plane);
  if (token) headers.set("X-CSRF-Token", token);
  return fetch(input, { cache: "no-store", ...init, headers });
}

export function usePlaneSessionLifecycle(plane: PlaneKey, initialSession?: unknown): {
  activeOrg: ActiveOrg | null;
  activeUser: ActiveUser | null;
  warningSeconds: number | null;
  continuePending: boolean;
  continueSession: () => Promise<void>;
  logoutNow: () => void;
} {
  const config = getPlaneConfig(plane);
  const initial = isSessionPayload(initialSession) ? initialSession : null;
  const [activeOrg, setActiveOrg] = useState<ActiveOrg | null>(() => initial ? activeOrgFromSession(initial) : null);
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(() => initial ? activeUserFromSession(initial) : null);
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const [continuePending, setContinuePending] = useState(false);
  const [sessionPolicy, setSessionPolicy] = useState<SessionPolicyDefaults>(() => normalizeClientSessionPolicy(initial?.sessionPolicy));
  const accessExpiresAtRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const lastHeartbeatAtRef = useRef(0);
  const warningActiveRef = useRef(false);
  const logoutStartedRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const scheduleRefreshRef = useRef<(expiresAt: number, policy?: SessionPolicyDefaults) => void>(() => {});
  const storageKey = activityStorageKey(plane);
  const channelName = activityChannelName(plane);
  const heartbeatStorageKey = `athyper:${plane}:lastHeartbeatAt`;

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearWarning = useCallback(() => {
    warningActiveRef.current = false;
    setWarningSeconds(null);
    setContinuePending(false);
  }, []);

  const logoutNow = useCallback(() => {
    if (logoutStartedRef.current) return;
    logoutStartedRef.current = true;
    clearRefreshTimer();
    // Security-sensitive browser capabilities (including document edit
    // workspaces) clear synchronously before navigation destroys the shell.
    window.dispatchEvent(new Event("athyper:session-logout"));
    window.location.assign(config.logoutPath);
  }, [clearRefreshTimer, config.logoutPath]);

  const recordActivity = useCallback((at = Date.now()) => {
    const latest = Math.max(at, lastActivityAtRef.current, readStoredActivity(storageKey));
    lastActivityAtRef.current = latest;
    writeStoredActivity(storageKey, latest);

    try {
      const message: SessionActivityMessage = { type: "activity", at: latest };
      channelRef.current?.postMessage(message);
    } catch {
      // BroadcastChannel is best-effort.
    }

    return latest;
  }, [storageKey]);

  const latestActivityAt = useCallback(() => {
    const latest = Math.max(lastActivityAtRef.current, readStoredActivity(storageKey));
    lastActivityAtRef.current = latest;
    return latest;
  }, [storageKey]);

  const elapsedIdleSeconds = useCallback(() => {
    return (Date.now() - latestActivityAt()) / 1000;
  }, [latestActivityAt]);

  const touchSession = useCallback(async (force = false): Promise<boolean> => {
    const now = Date.now();
    const persistedHeartbeat = readStoredActivity(heartbeatStorageKey);
    const latestHeartbeat = Math.max(lastHeartbeatAtRef.current, persistedHeartbeat);
    if (!force && now - latestHeartbeat < sessionPolicy.heartbeatIntervalMs) {
      return true;
    }

    lastHeartbeatAtRef.current = now;
    writeStoredActivity(heartbeatStorageKey, now);
    try {
      const headers = force ? { "X-Session-Continue": "1" } : undefined;
      const response = await csrfFetch(plane, "/api/auth/touch", { method: "POST", headers });
      return response.ok;
    } catch {
      return false;
    }
  }, [heartbeatStorageKey, plane, sessionPolicy.heartbeatIntervalMs]);

  const refreshAccessToken = useCallback(async (): Promise<"ready" | "retry" | "expired"> => {
    if (logoutStartedRef.current) return "expired";

    try {
      const response = await csrfFetch(plane, "/api/auth/refresh", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as RefreshBody;

      if (response.ok && body.ok && typeof body.accessExpiresAt === "number") {
        const nextPolicy = body.sessionPolicy === undefined
          ? sessionPolicy
          : normalizeClientSessionPolicy(body.sessionPolicy);
        if (body.sessionPolicy !== undefined) {
          setSessionPolicy((current) => isSameSessionPolicy(current, nextPolicy) ? current : nextPolicy);
        }
        accessExpiresAtRef.current = body.accessExpiresAt;
        scheduleRefreshRef.current(body.accessExpiresAt, nextPolicy);
        return "ready";
      }

      if (response.status === 202) {
        const nextPolicy = body.sessionPolicy === undefined
          ? sessionPolicy
          : normalizeClientSessionPolicy(body.sessionPolicy);
        if (body.sessionPolicy !== undefined) {
          setSessionPolicy((current) => isSameSessionPolicy(current, nextPolicy) ? current : nextPolicy);
        }
        const retryMs = Math.max((body.retryAfter ?? 1) * 1000, 1_000);
        clearRefreshTimer();
        refreshTimerRef.current = setTimeout(() => { void refreshAccessToken(); }, retryMs);
        return "retry";
      }

      if (response.status === 401 || response.status === 403 || body.redirect) {
        logoutNow();
        return "expired";
      }

      const retryMs = Math.max((body.retryAfter ?? 30) * 1000, 5_000);
      clearRefreshTimer();
      refreshTimerRef.current = setTimeout(() => { void refreshAccessToken(); }, retryMs);
      return "retry";
    } catch {
      clearRefreshTimer();
      refreshTimerRef.current = setTimeout(() => { void refreshAccessToken(); }, 30_000);
      return "retry";
    }
  }, [clearRefreshTimer, logoutNow, plane, sessionPolicy]);

  const scheduleTokenRefresh = useCallback((expiresAt: number, policy = sessionPolicy) => {
    clearRefreshTimer();
    if (!Number.isFinite(expiresAt) || expiresAt <= 0 || logoutStartedRef.current) return;

    accessExpiresAtRef.current = expiresAt;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const leadSeconds = policy.clientRefreshBeforeExpirySeconds;
    const fireInMs = Math.max((expiresAt - leadSeconds - nowSeconds) * 1000, 0);

    refreshTimerRef.current = setTimeout(() => {
      if (warningActiveRef.current) {
        refreshTimerRef.current = setTimeout(() => {
          scheduleTokenRefresh(accessExpiresAtRef.current, policy);
        }, 30_000);
        return;
      }
      void refreshAccessToken();
    }, fireInMs);
  }, [clearRefreshTimer, refreshAccessToken, sessionPolicy]);

  scheduleRefreshRef.current = scheduleTokenRefresh;

  useEffect(() => {
    const controller = new AbortController();
    if (initial) {
      accessExpiresAtRef.current = initial.accessExpiresAt;
      scheduleTokenRefresh(initial.accessExpiresAt, normalizeClientSessionPolicy(initial.sessionPolicy));
    }
    const revalidateTimer = window.setTimeout(() => fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) logoutNow();
          return null;
        }
        return response.json() as Promise<unknown>;
      })
      .then((session) => {
        if (!isSessionPayload(session)) return;
        const nextPolicy = normalizeClientSessionPolicy(session.sessionPolicy);
        setSessionPolicy((current) => isSameSessionPolicy(current, nextPolicy) ? current : nextPolicy);
        setActiveOrg(activeOrgFromSession(session));
        setActiveUser(activeUserFromSession(session));
        scheduleTokenRefresh(session.accessExpiresAt, nextPolicy);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
      }), initial ? 2_000 : 0);

    return () => {
      window.clearTimeout(revalidateTimer);
      controller.abort();
    };
  }, [initialSession, logoutNow, scheduleTokenRefresh]);

  useEffect(() => {
    const stored = readStoredActivity(storageKey);
    const initial = stored > 0 ? Math.max(stored, lastActivityAtRef.current) : Date.now();
    lastActivityAtRef.current = initial;
    writeStoredActivity(storageKey, initial);
  }, [storageKey]);

  useEffect(() => {
    const handleActivity = () => {
      if (warningActiveRef.current || logoutStartedRef.current) return;
      recordActivity(Date.now());
      void touchSession();
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [recordActivity, touchSession]);

  useEffect(() => {
    const syncActivity = (at: number) => {
      if (!Number.isFinite(at) || at <= 0 || at <= lastActivityAtRef.current) return;
      lastActivityAtRef.current = at;
      if (warningActiveRef.current) clearWarning();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      syncActivity(Number(event.newValue));
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(channelName);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<SessionActivityMessage>) => {
        if (event.data?.type !== "activity") return;
        syncActivity(event.data.at);
      };
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      if (channelRef.current === channel) channelRef.current = null;
      channel?.close();
    };
  }, [channelName, clearWarning, storageKey]);

  useEffect(() => {
    const evaluateIdle = () => {
      if (logoutStartedRef.current) return;

      const elapsedSeconds = elapsedIdleSeconds();
      const { idleTimeoutSeconds, idleWarningSeconds } = sessionPolicy;
      const warningStartSeconds = idleTimeoutSeconds - idleWarningSeconds;

      if (elapsedSeconds >= idleTimeoutSeconds) { logoutNow(); return; }

      if (elapsedSeconds >= warningStartSeconds) {
        warningActiveRef.current = true;
        setWarningSeconds(Math.max(0, Math.ceil(idleTimeoutSeconds - elapsedSeconds)));
        return;
      }

      if (warningActiveRef.current) clearWarning();
    };

    evaluateIdle();
    const interval = setInterval(evaluateIdle, 1_000);
    return () => clearInterval(interval);
  }, [clearWarning, elapsedIdleSeconds, logoutNow, sessionPolicy.idleTimeoutSeconds, sessionPolicy.idleWarningSeconds]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || logoutStartedRef.current) return;

      const elapsedSeconds = elapsedIdleSeconds();
      const { idleTimeoutSeconds, idleWarningSeconds } = sessionPolicy;
      const warningStartSeconds = idleTimeoutSeconds - idleWarningSeconds;

      if (elapsedSeconds >= idleTimeoutSeconds) { logoutNow(); return; }

      if (elapsedSeconds >= warningStartSeconds) {
        warningActiveRef.current = true;
        setWarningSeconds(Math.max(0, Math.ceil(idleTimeoutSeconds - elapsedSeconds)));
        return;
      }

      clearWarning();
      recordActivity(Date.now());
      void touchSession(true);
      scheduleTokenRefresh(accessExpiresAtRef.current);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [clearWarning, elapsedIdleSeconds, logoutNow, recordActivity, scheduleTokenRefresh, sessionPolicy.idleTimeoutSeconds, sessionPolicy.idleWarningSeconds, touchSession]);

  useEffect(() => {
    return clearRefreshTimer;
  }, [clearRefreshTimer]);

  const continueSession = useCallback(async () => {
    if (continuePending || logoutStartedRef.current) return;

    setContinuePending(true);
    const touched = await touchSession(true);
    if (!touched) { logoutNow(); return; }

    const refreshStatus = await refreshAccessToken();
    if (refreshStatus === "expired") return;

    clearWarning();
    recordActivity(Date.now());
  }, [clearWarning, continuePending, logoutNow, recordActivity, refreshAccessToken, touchSession]);

  return { activeOrg, activeUser, warningSeconds, continuePending, continueSession, logoutNow };
}
