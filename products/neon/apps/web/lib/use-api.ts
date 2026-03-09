"use client";

/**
 * Shared API Hook Factory
 *
 * Provides a single, consistent data-fetching pattern for all modules.
 * Replaces the duplicated useState + useEffect + AbortController boilerplate
 * found across finance, schema-manager, and other modules.
 *
 * Usage:
 *   const { data, loading, error, refresh } = useApi<MyDTO>("/api/fin/something", {
 *     params: { fiscalYear: 2026, period: 3 },
 *     paused: !entityId,     // skip fetch when not ready
 *   });
 *
 * For mutations:
 *   const { execute, executing, error } = useApiMutation<Input, Output>("/api/fin/action", "POST");
 *   await execute({ body: myPayload });
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";

// ---------------------------------------------------------------------------
// Error class (app-wide, replaces module-specific error classes)
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    httpStatus: number,
    body: { code?: string; message?: string; details?: Record<string, unknown> },
  ) {
    super(body.message ?? `Request failed (${httpStatus})`);
    this.name = "ApiError";
    this.code = body.code ?? "UNKNOWN";
    this.httpStatus = httpStatus;
    this.details = body.details;
  }

  get isConflict(): boolean { return this.httpStatus === 409; }
  get isNotFound(): boolean { return this.httpStatus === 404; }
  get isValidation(): boolean { return this.httpStatus === 400 || this.httpStatus === 422; }
  get isUnauthorized(): boolean { return this.httpStatus === 401; }
  get isForbidden(): boolean { return this.httpStatus === 403; }
}

// ---------------------------------------------------------------------------
// Core fetch function (shared across query + mutation)
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...buildHeaders() };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    credentials: "same-origin",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({
      code: "UNKNOWN",
      message: `Request failed (${res.status})`,
    }));
    throw new ApiError(res.status, errBody.error ?? errBody);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// useApi — declarative query hook
// ---------------------------------------------------------------------------

export interface UseApiOptions {
  /** Query parameters appended to the URL. */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** When true, the fetch is skipped (useful for conditional fetching). */
  paused?: boolean;
}

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Declarative data-fetching hook with automatic abort and refresh support.
 *
 * @param baseUrl API endpoint (e.g., "/api/fin/gl/summary")
 * @param options Query params and pause control
 */
export function useApi<T>(
  baseUrl: string | null,
  options: UseApiOptions = {},
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const paused = options.paused ?? !baseUrl;

  // Build full URL with query params
  const fullUrl = buildUrl(baseUrl, options.params);
  // Stable dependency key for params
  const paramsKey = JSON.stringify(options.params ?? {});

  const fetchData = useCallback(async () => {
    if (paused || !fullUrl) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch<T>(fullUrl, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof ApiError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load data";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullUrl, paused, paramsKey]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useApiMutation — imperative mutation hook
// ---------------------------------------------------------------------------

export interface UseApiMutationResult<TInput, TOutput> {
  execute: (input?: { body?: TInput; urlSuffix?: string }) => Promise<TOutput>;
  executing: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * Imperative mutation hook for POST/PUT/PATCH/DELETE operations.
 *
 * @param baseUrl API endpoint
 * @param method HTTP method
 */
export function useApiMutation<TInput = unknown, TOutput = unknown>(
  baseUrl: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
): UseApiMutationResult<TInput, TOutput> {
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (input?: { body?: TInput; urlSuffix?: string }): Promise<TOutput> => {
      setExecuting(true);
      setError(null);

      try {
        const url = input?.urlSuffix ? `${baseUrl}/${input.urlSuffix}` : baseUrl;
        const result = await apiFetch<TOutput>(url, {
          method,
          body: input?.body,
        });
        return result;
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message
          : err instanceof Error ? err.message
          : "Operation failed";
        setError(message);
        throw err;
      } finally {
        setExecuting(false);
      }
    },
    [baseUrl, method],
  );

  const reset = useCallback(() => setError(null), []);

  return { execute, executing, error, reset };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUrl(
  base: string | null,
  params?: Record<string, string | number | boolean | undefined | null>,
): string | null {
  if (!base) return null;
  if (!params) return base;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? `${base}?${qs}` : base;
}
