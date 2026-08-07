"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runtimePath } from "@athyper/platform-api-client";

export interface EditLockState {
  isLocked:   boolean;
  lockToken:  string | null;
  rowVersion: number | null;
  error:      string | null;
}

export interface UseEditLockOptions {
  entityCode:       string;
  recordId:         string;
  /** Auth-aware fetch wrapper that prepends the API base URL and injects Authorization. */
  apiFetch:         (path: string, init?: RequestInit) => Promise<Response>;
  /** Heartbeat interval in ms. Default: 30 000 */
  heartbeatMs?:     number;
  onVersionChange?: (version: number) => void;
}

export function useEditLock(opts: UseEditLockOptions): EditLockState & {
  acquire: () => Promise<{ lockToken: string; rowVersion: number } | null>;
  release: () => Promise<void>;
} {
  const { entityCode, recordId, heartbeatMs = 30_000, onVersionChange } = opts;

  const [state, setState] = useState<EditLockState>({
    isLocked: false, lockToken: null, rowVersion: null, error: null,
  });

  const lockTokenRef   = useRef<string | null>(null);
  const apiFetchRef    = useRef(opts.apiFetch);
  const onVersionRef   = useRef(onVersionChange);
  apiFetchRef.current  = opts.apiFetch;
  onVersionRef.current = onVersionChange;

  const lockPath = runtimePath.lock(entityCode, recordId);

  const acquire = useCallback(async () => {
    try {
      const res  = await apiFetchRef.current(lockPath, { method: "POST" });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        setState((s) => ({ ...s, error: String(data["error"] ?? "LOCK_FAILED") }));
        return null;
      }
      const token   = data["lock_token"]  as string;
      const version = data["row_version"] as number;
      lockTokenRef.current = token;
      setState({ isLocked: true, lockToken: token, rowVersion: version, error: null });
      onVersionRef.current?.(version);
      return { lockToken: token, rowVersion: version };
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
      return null;
    }
  }, [lockPath]);

  const release = useCallback(async () => {
    const token = lockTokenRef.current;
    if (!token) return;
    lockTokenRef.current = null;
    setState({ isLocked: false, lockToken: null, rowVersion: null, error: null });
    try {
      await apiFetchRef.current(lockPath, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ lock_token: token }),
      });
    } catch {
      // Best-effort — server TTL + sweep worker will clean up stale locks
    }
  }, [lockPath]);

  // Heartbeat — only runs while locked
  useEffect(() => {
    if (!state.isLocked) return;

    const id = setInterval(async () => {
      const token = lockTokenRef.current;
      if (!token) return;
      try {
        const res = await apiFetchRef.current(`${lockPath}/heartbeat`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ lock_token: token }),
        });
        if (!res.ok) {
          lockTokenRef.current = null;
          setState({ isLocked: false, lockToken: null, rowVersion: null, error: "LOCK_EXPIRED" });
        }
      } catch {
        // Network blip — next heartbeat will retry
      }
    }, heartbeatMs);

    return () => clearInterval(id);
  }, [state.isLocked, lockPath, heartbeatMs]);

  // Best-effort release on unmount
  useEffect(() => {
    return () => {
      const token = lockTokenRef.current;
      if (!token) return;
      lockTokenRef.current = null;
      apiFetchRef.current(lockPath, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ lock_token: token }),
      }).catch(() => {});
    };
    // lockPath is stable for the lifetime of the component; apiFetch via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockPath]);

  return { ...state, acquire, release };
}
