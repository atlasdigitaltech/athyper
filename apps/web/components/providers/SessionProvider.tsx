"use client";

/**
 * SessionProvider — shell-level session context
 *
 * Provides two layers of session data to all shell components:
 *   bff    — identity, organizations, activeOrg/Workbench (from BFF Redis session)
 *   runtime — modules, permissions, scope, delegations (from runtime API via BFF proxy)
 *
 * Responsibilities:
 *   - Fetches runtime session on mount and after each context switch
 *   - Exposes switchContext() for EntitySelector / WorkbenchToggle
 *   - Exposes activateDelegation() / deactivateDelegation() for delegation UI
 *   - Calls router.refresh() after context switch so Server Components
 *     (shell layout, breadcrumbs) re-read the updated BFF session
 *
 * Initial BFF session is passed as a prop from the Server Component layout
 * so the shell renders immediately without an extra client-side fetch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type { ShellSessionProps } from "@/lib/server/get-server-session";
import { parseOrgAlias } from "@/lib/auth/parse-org-alias";
import type { RuntimeSession } from "@athyper/auth";

const LAST_CONTEXT_KEY = "neon:lastContext";

// ─── Context shape ────────────────────────────────────────────────────────────

export interface RuntimeErrorInfo {
  /** Machine-readable error code forwarded from the runtime (e.g. PRINCIPAL_NOT_FOUND). */
  code: string;
  /** Human-readable message forwarded from the runtime. */
  message: string;
  /** HTTP status from the upstream runtime response. */
  status: number;
}

export interface SessionContextValue {
  /** BFF-derived identity + org memberships. Updated after switchContext(). */
  bff: ShellSessionProps;
  /** Runtime session (modules, permissions, scope, delegations). null until fetched. */
  runtime: RuntimeSession | null;
  /** True while the runtime session is being fetched. */
  runtimeLoading: boolean;
  /** Set when the runtime session fetch fails — null on success or before first fetch. */
  runtimeError: RuntimeErrorInfo | null;
  /** UUID of the currently activated delegation, or null. */
  activeDelegationId: string | null;
  /**
   * Switch the active entity + workbench.
   * PATCHes /api/auth/session, updates local state, re-fetches runtime session,
   * and refreshes Server Components via router.refresh().
   *
   * Throws on network / server error so callers can show feedback.
   */
  switchContext: (org: string, workbench: string) => Promise<void>;
  /**
   * Activate a delegation by UUID.
   * Re-fetches runtime session with ?delegation= param — merges delegated
   * permissions into the session response. Sets activeDelegationId.
   */
  activateDelegation: (delegationId: string) => Promise<void>;
  /**
   * Deactivate the current delegation.
   * Re-fetches runtime session without the ?delegation= param.
   */
  deactivateDelegation: () => Promise<void>;
  /**
   * Re-fetch the runtime session using the current active context.
   * Used by error banners / dialogs to offer a "Retry" action without
   * requiring the user to switch entity or reload the full page.
   */
  retryRuntime: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface SessionProviderProps {
  initialSession: ShellSessionProps;
  children: ReactNode;
}

export function SessionProvider({
  initialSession,
  children,
}: SessionProviderProps) {
  const router = useRouter();
  const [bff, setBff] = useState<ShellSessionProps>(initialSession);
  const [runtime, setRuntime] = useState<RuntimeSession | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState<RuntimeErrorInfo | null>(null);
  const [activeDelegationId, setActiveDelegationId] = useState<string | null>(null);

  // Track active context key to avoid redundant fetches
  const lastContextRef = useRef(
    `${initialSession.activeOrg ?? ""}:${initialSession.activeWorkbench ?? ""}`,
  );

  // Track the scheduled refresh timer so we can cancel on unmount
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the latest known accessExpiresAt so the timer can chain
  const accessExpiresAtRef = useRef<number>(initialSession.accessExpiresAt ?? 0);

  // Timestamp of the last heartbeat sent (ms). Used to throttle touch calls.
  const lastHeartbeatRef = useRef(0);

  // ── Last-used context restore ─────────────────────────────────────────────
  // On mount: if the BFF session has no active context (e.g. first login or
  // session cleared), try to restore from localStorage and re-select.
  useEffect(() => {
    if (initialSession.activeOrg) return; // context already set — skip

    try {
      const stored = localStorage.getItem(LAST_CONTEXT_KEY);
      if (!stored) return;
      const { org, workbench } = JSON.parse(stored) as { org?: string; workbench?: string };
      if (org && workbench && initialSession.organizations[org]) {
        void switchContext(org, workbench);
      }
    } catch {
      // Ignore malformed storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Proactive token refresh timer ────────────────────────────────────────
  // Schedules POST /api/auth/refresh to fire REFRESH_BEFORE_EXPIRY_SEC before
  // the access token expires. On success, reschedules for the new expiry.
  // On failure (redirect), surfaces INVALID_TOKEN so the expired dialog shows.
  //
  // Design notes:
  //   - 90s before expiry = well inside the server's 120s "skip if still valid" guard
  //   - Timer is reset on each successful refresh (chained, not interval-based)
  //   - Unmount + context-switch both cancel the pending timer
  const REFRESH_BEFORE_EXPIRY_SEC = 90;

  const scheduleTokenRefresh = useCallback((expiresAt: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const nowSec = Math.floor(Date.now() / 1000);
    const fireInMs = Math.max((expiresAt - REFRESH_BEFORE_EXPIRY_SEC - nowSec) * 1000, 0);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          redirect?: string;
          accessExpiresAt?: number;
          retryAfter?: number;
          reason?: string;
        };

        if (body.ok && body.accessExpiresAt) {
          // Refresh succeeded — schedule next refresh for the new expiry
          accessExpiresAtRef.current = body.accessExpiresAt;
          scheduleTokenRefresh(body.accessExpiresAt);
        } else if (body.redirect) {
          // Hard failure: KC explicitly invalidated the session (invalid_grant,
          // session expired, user disabled). Show the re-auth dialog.
          setRuntimeError({
            code: "INVALID_TOKEN",
            message: body.reason ?? "Your session has expired. Please sign in again.",
            status: 401,
          });
        } else {
          // Transient failure: KC temporarily unavailable or network error.
          // Do NOT surface a dialog — session is still alive in Redis.
          // Reschedule a retry using the server-suggested delay (default 30s).
          const retryMs = typeof body.retryAfter === "number" ? body.retryAfter * 1000 : 30_000;
          refreshTimerRef.current = setTimeout(() => scheduleTokenRefresh(accessExpiresAtRef.current), retryMs);
        }
      } catch {
        // Network-level error reaching /api/auth/refresh — retry in 30s.
        // The existing access token may still be valid; don't break the chain.
        refreshTimerRef.current = setTimeout(() => scheduleTokenRefresh(accessExpiresAtRef.current), 30_000);
      }
    }, fireInMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the refresh timer on mount; cancel on unmount
  useEffect(() => {
    if (accessExpiresAtRef.current > 0) {
      scheduleTokenRefresh(accessExpiresAtRef.current);
    }
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleTokenRefresh]);

  // ── Activity heartbeat ────────────────────────────────────────────────────
  // Updates lastSeenAt in Redis while the user is actively interacting with
  // the page. Throttled to at most once per HEARTBEAT_INTERVAL_MS so normal
  // mouse/keyboard events don't flood the server.
  //
  // Without this, lastSeenAt is only written at login and context switches.
  // For tokens with lifetime > 16 min the proactive refresh would always fire
  // after the 15-min idle window, producing false "session expired" dialogs.
  const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 min — well inside 15-min idle window

  const touchSession = useCallback(async () => {
    const now = Date.now();
    if (now - lastHeartbeatRef.current < HEARTBEAT_INTERVAL_MS) return;
    lastHeartbeatRef.current = now;
    try {
      await fetch("/api/auth/touch", { method: "POST" });
    } catch {
      // Non-fatal — next activity event will retry
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;
    const handler = () => { void touchSession(); };
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [touchSession]);

  // When the tab becomes visible again (wake from sleep, switching tabs) immediately
  // touch the session so lastSeenAt is fresh, then reschedule the refresh timer.
  // Without this, the timer fires with a stale lastSeenAt and the server treats
  // the session as idle even if the user was just active in another window.
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      lastHeartbeatRef.current = 0; // Allow immediate touch on next user event too
      try {
        await fetch("/api/auth/touch", { method: "POST" });
      } catch {
        // Non-fatal — proceed with reschedule regardless
      }
      scheduleTokenRefresh(accessExpiresAtRef.current);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [scheduleTokenRefresh]);

  // ── Runtime session fetch ─────────────────────────────────────────────────

  const fetchRuntime = useCallback(
    async (tenant: string, entity: string, workbench: string, delegationId?: string | null) => {
      setRuntimeLoading(true);
      setRuntimeError(null);
      try {
        const params = new URLSearchParams({ tenant, entity, workbench });
        if (delegationId) params.set("delegation", delegationId);
        const runtimeUrl = `/api/runtime/session?${params}`;

        let res = await fetch(runtimeUrl);

        // One-shot reactive refresh: if the access token expired between the
        // proactive timer and this request, refresh via POST /api/auth/refresh
        // (which holds the distributed lock + rotates SID) then retry once.
        // Doing this client-side avoids the race where a server-side refresh
        // and the proactive timer both consume the single-use KC refresh token.
        if (res.status === 401) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          if (errBody.error === "INVALID_TOKEN" || errBody.error === "MISSING_TOKEN") {
            const refreshRes = await fetch("/api/auth/refresh", { method: "POST" }).catch(() => null);
            const refreshBody = (await refreshRes?.json().catch(() => ({})) ?? {}) as {
              ok?: boolean;
              accessExpiresAt?: number;
              redirect?: string;
            };

            if (refreshBody.ok && refreshBody.accessExpiresAt) {
              // Refresh succeeded — update timer and retry with new neon_sid cookie
              accessExpiresAtRef.current = refreshBody.accessExpiresAt;
              scheduleTokenRefresh(refreshBody.accessExpiresAt);
              res = await fetch(runtimeUrl);
            } else {
              // Refresh failed (idle timeout, invalid_grant, etc.) — show dialog
              setRuntime(null);
              setRuntimeError({
                code: "INVALID_TOKEN",
                message: "Your session has expired. Please sign in again.",
                status: 401,
              });
              return;
            }
          }
        }

        if (res.ok) {
          const data = (await res.json()) as RuntimeSession;
          setRuntime(data);
        } else {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          setRuntime(null);
          setRuntimeError({
            code: body.error ?? "RUNTIME_ERROR",
            message: body.message ?? "Failed to load runtime session.",
            status: res.status,
          });
        }
      } catch {
        setRuntime(null);
        setRuntimeError({ code: "NETWORK_ERROR", message: "Runtime service unavailable.", status: 0 });
      } finally {
        setRuntimeLoading(false);
      }
    },
    [scheduleTokenRefresh], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Fetch runtime session whenever the active context changes
  useEffect(() => {
    const { activeOrg, activeWorkbench } = bff;
    if (!activeOrg || !activeWorkbench) {
      setRuntimeLoading(false);
      setRuntimeError(null);
      return;
    }
    const { tenant, entity } = parseOrgAlias(activeOrg);
    if (tenant === entity) {
      // No "--" separator found — malformed alias, skip fetch
      setRuntimeLoading(false);
      return;
    }
    // Reset delegation when context changes
    setActiveDelegationId(null);
    void fetchRuntime(tenant, entity, activeWorkbench, null);
  }, [bff.activeOrg, bff.activeWorkbench, fetchRuntime]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers to parse active org ───────────────────────────────────────────

  function parsedActiveOrg(): { tenant: string; entity: string } | null {
    const { activeOrg } = bff;
    if (!activeOrg) return null;
    const parsed = parseOrgAlias(activeOrg);
    if (parsed.tenant === parsed.entity) return null; // no "--" separator
    return parsed;
  }

  // ── Context switch ─────────────────────────────────────────────────────────

  const switchContext = useCallback(
    async (org: string, workbench: string) => {
      const newKey = `${org}:${workbench}`;
      if (lastContextRef.current === newKey) return;

      const res = await fetch("/api/auth/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org, workbench }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setRuntimeError({
          code: body.error ?? "RUNTIME_ERROR",
          message: body.message ?? "Failed to switch entity. Please try again.",
          status: res.status,
        });
        return;
      }

      lastContextRef.current = newKey;

      try {
        localStorage.setItem(
          "neon:lastContext",
          JSON.stringify({ org, workbench }),
        );
      } catch {
        // Storage unavailable — ignore
      }

      // Reset delegation on context switch
      setActiveDelegationId(null);
      setBff((prev) => ({ ...prev, activeOrg: org, activeWorkbench: workbench }));

      const { tenant, entity } = parseOrgAlias(org);
      if (tenant !== entity) {
        await fetchRuntime(tenant, entity, workbench, null);
      }

      router.refresh();
    },
    [fetchRuntime, router],
  );

  // ── Delegation ─────────────────────────────────────────────────────────────

  const activateDelegation = useCallback(
    async (delegationId: string) => {
      const parsed = parsedActiveOrg();
      if (!parsed || !bff.activeWorkbench) return;

      setActiveDelegationId(delegationId);
      await fetchRuntime(parsed.tenant, parsed.entity, bff.activeWorkbench, delegationId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bff.activeOrg, bff.activeWorkbench, fetchRuntime],
  );

  const deactivateDelegation = useCallback(
    async () => {
      const parsed = parsedActiveOrg();
      if (!parsed || !bff.activeWorkbench) return;

      setActiveDelegationId(null);
      await fetchRuntime(parsed.tenant, parsed.entity, bff.activeWorkbench, null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bff.activeOrg, bff.activeWorkbench, fetchRuntime],
  );

  const retryRuntime = useCallback(() => {
    const { activeOrg, activeWorkbench } = bff;
    if (!activeOrg || !activeWorkbench) return;
    const { tenant, entity } = parseOrgAlias(activeOrg);
    if (tenant === entity) return; // no "--" separator
    void fetchRuntime(tenant, entity, activeWorkbench, activeDelegationId);
  }, [bff, activeDelegationId, fetchRuntime]);

  return (
    <SessionContext.Provider
      value={{
        bff,
        runtime,
        runtimeLoading,
        runtimeError,
        activeDelegationId,
        switchContext,
        activateDelegation,
        deactivateDelegation,
        retryRuntime,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useShellSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useShellSession must be used within <SessionProvider>");
  }
  return ctx;
}
