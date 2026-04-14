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
          reason?: string;
        };

        if (body.ok && body.accessExpiresAt) {
          // Refresh succeeded — schedule next refresh for the new expiry
          accessExpiresAtRef.current = body.accessExpiresAt;
          scheduleTokenRefresh(body.accessExpiresAt);
        } else if (body.redirect) {
          // Refresh token expired or session destroyed — surface as auth error
          setRuntimeError({
            code: "INVALID_TOKEN",
            message: body.reason ?? "Your session has expired. Please sign in again.",
            status: 401,
          });
        }
      } catch {
        // Network error — will surface naturally on the next runtime fetch
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

  // ── Runtime session fetch ─────────────────────────────────────────────────

  const fetchRuntime = useCallback(
    async (tenant: string, entity: string, workbench: string, delegationId?: string | null) => {
      setRuntimeLoading(true);
      setRuntimeError(null);
      try {
        const params = new URLSearchParams({ tenant, entity, workbench });
        if (delegationId) params.set("delegation", delegationId);
        const res = await fetch(`/api/runtime/session?${params}`);
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
    [],
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
