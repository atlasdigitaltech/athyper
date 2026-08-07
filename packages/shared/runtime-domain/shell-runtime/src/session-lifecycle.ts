"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPlaneConfig,
  readCookieWithHostPrefix,
  SESSION_POLICY_DEFAULTS,
  type PlaneKey,
  type SessionPolicyDefaults,
} from "@athyper/platform-iam-session-plane";

export type FavoritesPanelTab = "bookmarks" | "recent";

export interface FavoritesPanelSlotProps {
  activeTab: FavoritesPanelTab;
  onTabChange: (tab: FavoritesPanelTab) => void;
  onClose: () => void;
}

export interface ActiveOrg {
  orgName: string;
  legalEntityName: string;
  legalEntityCode?: string;
  tenantName: string;
  tenantCode?: string;
  networkAccountName?: string;
  networkAccountCode?: string;
  networkAccountRole?: string;
  roles: string[];
}

export interface ActiveUser {
  displayName: string;
  initials: string;
  email?: string;
}

export interface ActiveSessionStatus {
  mfaRequired: boolean;
  mfaVerified: boolean;
  supportMode: boolean;
}

export interface OrgOption {
  alias: string;
  name: string;
  legalEntityName: string;
  legalEntityCode?: string;
  tenantName: string;
  tenantCode?: string;
  workbenches: string[];
  isActive: boolean;
}

export type ScopeSwitchStatus = "idle" | "switching";

export type SessionWarningReason = "idle" | "absolute";
export type SessionLifecycleState = "active" | "idle_warning" | "absolute_warning" | "continuing" | "terminating" | "terminated";

interface SessionPayload {
  authenticated: true;
  activeOrg: string | null;
  organizations: Record<string, unknown>;
  accessExpiresAt: number;
  createdAt?: number;
  absoluteExpiresAt?: number;
  sessionPolicy?: unknown;
  displayName?: string;
  username?: string;
  email?: string;
  mfaRequired?: boolean;
  mfaVerified?: boolean;
  supportMode?: boolean;
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
  type: "activity" | "session_continued";
  at: number;
}

interface SessionLifecycleMessage {
  type: "session_terminated";
  reason: string;
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
    email?: unknown;
    mfaRequired?: unknown;
    mfaVerified?: unknown;
    supportMode?: unknown;
  };
  return (
    candidate.authenticated === true &&
    (candidate.activeOrg === null || typeof candidate.activeOrg === "string") &&
    isRecord(candidate.organizations) &&
    typeof candidate.accessExpiresAt === "number" &&
    (candidate.email === undefined || typeof candidate.email === "string") &&
    (candidate.mfaRequired === undefined || typeof candidate.mfaRequired === "boolean") &&
    (candidate.mfaVerified === undefined || typeof candidate.mfaVerified === "boolean") &&
    (candidate.supportMode === undefined || typeof candidate.supportMode === "boolean")
  );
}

interface OrgPayload {
  name: string;
  legalEntityName?: string;
  legalEntityCode?: string;
  tenantName?: string;
  tenantCode?: string;
  networkAccountName?: string;
  networkAccountCode?: string;
  networkAccountRole?: string;
  roles?: string[];
}

function isOrgPayload(value: unknown): value is OrgPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    name?: unknown;
    legalEntityName?: unknown;
    legalEntityCode?: unknown;
    tenantName?: unknown;
    tenantCode?: unknown;
    networkAccountName?: unknown;
    networkAccountCode?: unknown;
    networkAccountRole?: unknown;
    roles?: unknown;
  };
  return (
    typeof candidate.name === "string" &&
    (candidate.legalEntityName === undefined || typeof candidate.legalEntityName === "string") &&
    (candidate.legalEntityCode === undefined || typeof candidate.legalEntityCode === "string") &&
    (candidate.tenantName === undefined || typeof candidate.tenantName === "string") &&
    (candidate.tenantCode === undefined || typeof candidate.tenantCode === "string") &&
    (candidate.networkAccountName === undefined || typeof candidate.networkAccountName === "string") &&
    (candidate.networkAccountCode === undefined || typeof candidate.networkAccountCode === "string") &&
    (candidate.networkAccountRole === undefined || typeof candidate.networkAccountRole === "string") &&
    (candidate.roles === undefined || (Array.isArray(candidate.roles) && candidate.roles.every((role) => typeof role === "string")))
  );
}

function parseAliasTenant(alias: string): string {
  const idx = alias.indexOf("--");
  return idx > 0 ? alias.slice(0, idx) : alias;
}

export function orgOptionsFromSession(session: {
  activeOrg: string | null;
  organizations: Record<string, unknown>;
}): OrgOption[] {
  const options: OrgOption[] = [];
  for (const [alias, membership] of Object.entries(session.organizations)) {
    if (!isOrgPayload(membership)) continue;
    const tenantCode = membership.tenantCode ?? parseAliasTenant(alias);
    options.push({
      alias,
      name: membership.name,
      legalEntityName: membership.legalEntityName ?? membership.name,
      legalEntityCode: membership.legalEntityCode,
      tenantName: membership.tenantName ?? tenantCode.toUpperCase(),
      tenantCode,
      workbenches: membership.roles ?? [],
      isActive: session.activeOrg === alias,
    });
  }
  return options.sort((a, b) => a.legalEntityName.localeCompare(b.legalEntityName));
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function activeUserFromSession(session: {
  displayName?: string;
  username?: string;
  email?: string;
}): ActiveUser | null {
  const name = session.displayName ?? session.username;
  if (!name) return null;
  return { displayName: name, initials: toInitials(name), email: session.email };
}

export function activeSessionStatusFromSession(session: {
  mfaRequired?: boolean;
  mfaVerified?: boolean;
  supportMode?: boolean;
}): ActiveSessionStatus {
  return {
    mfaRequired: session.mfaRequired === true,
    mfaVerified: session.mfaVerified === true,
    supportMode: session.supportMode === true,
  };
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
    legalEntityCode: membership.legalEntityCode,
    tenantName: membership.tenantName ?? membership.name,
    tenantCode: membership.tenantCode,
    networkAccountName: membership.networkAccountName,
    networkAccountCode: membership.networkAccountCode,
    networkAccountRole: membership.networkAccountRole,
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
  return readCookieWithHostPrefix(
    getPlaneConfig(plane).csrfCookieName,
    (cookieName) => {
      const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
      if (!match) return undefined;
      try {
        return decodeURIComponent(match[1] ?? "");
      } catch {
        return undefined;
      }
    },
  ) ?? "";
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
  sessionStatus: ActiveSessionStatus;
  availableOrgs: OrgOption[];
  scopeSwitchStatus: ScopeSwitchStatus;
  scopeSwitchError: string | null;
  switchOrg: (alias: string, workbench: string) => Promise<void>;
  warningSeconds: number | null;
  warningReason: SessionWarningReason | null;
  lifecycleState: SessionLifecycleState;
  continuePending: boolean;
  continueSession: () => Promise<void>;
  logoutNow: () => void;
} {
  const config = getPlaneConfig(plane);
  const initial = isSessionPayload(initialSession) ? initialSession : null;
  const [activeOrg, setActiveOrg] = useState<ActiveOrg | null>(() => initial ? activeOrgFromSession(initial) : null);
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(() => initial ? activeUserFromSession(initial) : null);
  const [sessionStatus, setSessionStatus] = useState<ActiveSessionStatus>(() => (
    initial ? activeSessionStatusFromSession(initial) : activeSessionStatusFromSession({})
  ));
  const [sessionShape, setSessionShape] = useState<{
    activeOrg: string | null;
    organizations: Record<string, unknown>;
  }>(() => initial
    ? { activeOrg: initial.activeOrg, organizations: initial.organizations }
    : { activeOrg: null, organizations: {} });
  const [scopeSwitchStatus, setScopeSwitchStatus] = useState<ScopeSwitchStatus>("idle");
  const [scopeSwitchError, setScopeSwitchError] = useState<string | null>(null);
  const availableOrgs = useMemo(() => orgOptionsFromSession(sessionShape), [sessionShape]);
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const [warningReason, setWarningReason] = useState<SessionWarningReason | null>(null);
  const [lifecycleState, setLifecycleState] = useState<SessionLifecycleState>("active");
  const [continuePending, setContinuePending] = useState(false);
  const [sessionPolicy, setSessionPolicy] = useState<SessionPolicyDefaults>(() => normalizeClientSessionPolicy(initial?.sessionPolicy));
  const accessExpiresAtRef = useRef(0);
  const absoluteExpiresAtRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const lastHeartbeatAtRef = useRef(0);
  const touchInFlightRef = useRef<Promise<boolean> | null>(null);
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
    setWarningReason(null);
    setContinuePending(false);
    setLifecycleState("active");
  }, []);

  const logoutNow = useCallback(() => {
    if (logoutStartedRef.current) return;
    logoutStartedRef.current = true;
    setLifecycleState("terminating");
    clearRefreshTimer();
    // Security-sensitive browser capabilities (including document edit
    // workspaces) clear synchronously before navigation destroys the shell.
    window.dispatchEvent(new Event("athyper:session-logout"));
    try {
      channelRef.current?.postMessage({ type: "session_terminated", reason: "logout" } satisfies SessionLifecycleMessage);
    } catch {
      // BroadcastChannel is best-effort; server-side termination remains authoritative.
    }
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

    // Activity, focus and visibility events can arrive in the same browser
    // turn. Share one request so those signals cannot create parallel touches.
    // Explicit continuation still receives the result of the active touch;
    // both operations extend the same authenticated server session.
    if (touchInFlightRef.current) return touchInFlightRef.current;

    lastHeartbeatAtRef.current = now;
    writeStoredActivity(heartbeatStorageKey, now);
    const request = (async () => {
      try {
        const headers = force ? { "X-Session-Continue": "1" } : undefined;
        const response = await csrfFetch(plane, "/api/auth/touch", { method: "POST", headers });
        return response.ok;
      } catch {
        return false;
      }
    })();
    touchInFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (touchInFlightRef.current === request) touchInFlightRef.current = null;
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
        setLifecycleState("active");
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
      absoluteExpiresAtRef.current = initial.absoluteExpiresAt
        ?? (typeof initial.createdAt === "number"
          ? initial.createdAt + normalizeClientSessionPolicy(initial.sessionPolicy).absoluteTtlSeconds
          : 0);
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
        setSessionStatus(activeSessionStatusFromSession(session));
        setSessionShape({ activeOrg: session.activeOrg, organizations: session.organizations });
        absoluteExpiresAtRef.current = session.absoluteExpiresAt
          ?? (typeof session.createdAt === "number"
            ? session.createdAt + nextPolicy.absoluteTtlSeconds
            : absoluteExpiresAtRef.current);
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
      if (warningActiveRef.current && warningReason === "idle") clearWarning();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      syncActivity(Number(event.newValue));
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(channelName);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<SessionActivityMessage | SessionLifecycleMessage>) => {
        if (event.data?.type === "activity" || event.data?.type === "session_continued") {
          syncActivity(event.data.at);
          return;
        }
        if (event.data?.type === "session_terminated") {
          logoutNow();
        }
      };
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      if (channelRef.current === channel) channelRef.current = null;
      channel?.close();
    };
  }, [channelName, clearWarning, logoutNow, storageKey, warningReason]);

  useEffect(() => {
    const evaluateIdle = () => {
      if (logoutStartedRef.current) return;

      const elapsedSeconds = elapsedIdleSeconds();
      const { idleTimeoutSeconds, idleWarningSeconds } = sessionPolicy;
      const warningStartSeconds = idleTimeoutSeconds - idleWarningSeconds;
      const absoluteRemainingSeconds = absoluteExpiresAtRef.current > 0
        ? absoluteExpiresAtRef.current - Math.floor(Date.now() / 1000)
        : Number.POSITIVE_INFINITY;

      if (absoluteRemainingSeconds <= 0) { logoutNow(); return; }
      if (absoluteRemainingSeconds <= idleWarningSeconds) {
        warningActiveRef.current = true;
        setLifecycleState("absolute_warning");
        setWarningReason("absolute");
        setWarningSeconds(Math.max(0, Math.ceil(absoluteRemainingSeconds)));
        return;
      }
      if (elapsedSeconds >= idleTimeoutSeconds) { logoutNow(); return; }

      if (elapsedSeconds >= warningStartSeconds) {
        warningActiveRef.current = true;
        setLifecycleState("idle_warning");
        setWarningReason("idle");
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
      const absoluteRemainingSeconds = absoluteExpiresAtRef.current > 0
        ? absoluteExpiresAtRef.current - Math.floor(Date.now() / 1000)
        : Number.POSITIVE_INFINITY;

      if (absoluteRemainingSeconds <= 0) { logoutNow(); return; }
      if (absoluteRemainingSeconds <= idleWarningSeconds) {
        warningActiveRef.current = true;
        setLifecycleState("absolute_warning");
        setWarningReason("absolute");
        setWarningSeconds(Math.max(0, Math.ceil(absoluteRemainingSeconds)));
        return;
      }
      if (elapsedSeconds >= idleTimeoutSeconds) { logoutNow(); return; }

      if (elapsedSeconds >= warningStartSeconds) {
        warningActiveRef.current = true;
        setLifecycleState("idle_warning");
        setWarningReason("idle");
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

    if (warningReason === "absolute") {
      logoutNow();
      return;
    }

    setContinuePending(true);
    setLifecycleState("continuing");
    const touched = await touchSession(true);
    if (!touched) { logoutNow(); return; }

    const refreshStatus = await refreshAccessToken();
    if (refreshStatus === "expired") return;

    clearWarning();
    recordActivity(Date.now());
    try {
      channelRef.current?.postMessage({ type: "session_continued", at: Date.now() } satisfies SessionActivityMessage);
    } catch {
      // BroadcastChannel is best-effort.
    }
  }, [clearWarning, continuePending, logoutNow, recordActivity, refreshAccessToken, touchSession, warningReason]);

  const switchOrg = useCallback(async (alias: string, workbench: string) => {
    if (scopeSwitchStatus === "switching" || logoutStartedRef.current) return;
    setScopeSwitchStatus("switching");
    setScopeSwitchError(null);
    try {
      const response = await csrfFetch(plane, "/api/auth/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org: alias, workbench }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? "Failed to switch context.");
      }
      // Authenticated shell caches must not survive a principal scope change.
      window.dispatchEvent(new CustomEvent("athyper:session-context-change", { detail: { org: alias, workbench } }));
      window.location.reload();
    } catch (err) {
      setScopeSwitchStatus("idle");
      setScopeSwitchError(err instanceof Error ? err.message : "Failed to switch context.");
    }
  }, [plane, scopeSwitchStatus]);

  return {
    activeOrg,
    activeUser,
    sessionStatus,
    availableOrgs,
    scopeSwitchStatus,
    scopeSwitchError,
    switchOrg,
    warningSeconds,
    warningReason,
    lifecycleState,
    continuePending,
    continueSession,
    logoutNow,
  };
}
