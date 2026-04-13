"use client";

/**
 * useDiagnosticAction
 *
 * Manages the execution lifecycle of diagnostic actions:
 *   - Per-action loading state
 *   - Per-action result (auto-clears after 30 s; history persists)
 *   - In-session action history (last 50 entries with correlation IDs)
 *
 * Uses bffFetch so CSRF is handled automatically via the __csrf cookie.
 * Client-only actions (browser cache clear, debug bundle export) are
 * passed via `clientFn` and never hit the network.
 */

import { useState, useCallback } from "react";
import { bffFetch, BffError } from "@/lib/bff-fetch";

export interface ActionResult {
  ok: boolean;
  message: string;
  detail?: string;
  correlationId: string;
  duration: number;
  ts: number;
}

export interface HistoryEntry extends ActionResult {
  actionId: string;
  endpoint?: string;
}

export interface ExecuteOptions {
  /** BFF API URL — mutually exclusive with clientFn */
  url?: string;
  method?: "GET" | "POST";
  /** Client-side-only logic. Return a human-readable summary string or void. */
  clientFn?: () => Promise<string | void>;
  /** Called on success with the action result (e.g. to read detail for step logs). */
  onSuccess?: (result: ActionResult) => void;
}

const AUTO_CLEAR_MS = 30_000;
const HISTORY_LIMIT = 50;

export function useDiagnosticAction() {
  const [results, setResults] = useState<Record<string, ActionResult | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const execute = useCallback(
    async (actionId: string, opts: ExecuteOptions) => {
      const correlationId = `diag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const startTime = Date.now();

      setLoading((prev) => ({ ...prev, [actionId]: true }));
      setResults((prev) => ({ ...prev, [actionId]: null }));

      let result: ActionResult;

      try {
        if (opts.clientFn) {
          const msg = await opts.clientFn();
          result = {
            ok: true,
            message: typeof msg === "string" && msg ? msg : "Done",
            correlationId,
            duration: Date.now() - startTime,
            ts: Date.now(),
          };
        } else if (opts.url) {
          const data = await bffFetch<Record<string, unknown>>(opts.url, {
            method: opts.method ?? "POST",
          });
          result = {
            ok: true,
            message: data?.message ? String(data.message) : "Completed successfully",
            detail:  data?.detail  ? String(data.detail)  : undefined,
            correlationId,
            duration: Date.now() - startTime,
            ts: Date.now(),
          };
        } else {
          result = {
            ok: false,
            message: "No endpoint or client function provided",
            correlationId,
            duration: 0,
            ts: Date.now(),
          };
        }
      } catch (err) {
        result = {
          ok: false,
          message: err instanceof Error ? err.message : "Action failed",
          // BffError carries the HTTP status — show that instead of the redundant toString()
          detail: err instanceof BffError ? `HTTP ${err.status}` : undefined,
          correlationId,
          duration: Date.now() - startTime,
          ts: Date.now(),
        };
      }

      setResults((prev) => ({ ...prev, [actionId]: result }));
      setHistory((prev) =>
        [{ actionId, ...result, endpoint: opts.url }, ...prev].slice(0, HISTORY_LIMIT),
      );
      setLoading((prev) => ({ ...prev, [actionId]: false }));

      if (result.ok) opts.onSuccess?.(result);

      // Auto-clear the inline result card — history entry persists.
      const timer = setTimeout(() => {
        setResults((prev) => ({ ...prev, [actionId]: null }));
      }, AUTO_CLEAR_MS);

      return () => clearTimeout(timer);
    },
    [],
  );

  return { execute, results, loading, history };
}
