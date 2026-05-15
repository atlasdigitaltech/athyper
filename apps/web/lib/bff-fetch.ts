"use client";

import * as Sentry from "@sentry/nextjs";

/**
 * bff-fetch — CSRF-aware fetch wrapper for BFF API routes.
 *
 * Reads the `__csrf` cookie (JS-readable, double-submit pattern) and
 * attaches it as `X-CSRF-Token`. All mutating requests (POST/PATCH/DELETE)
 * require this header; GET requests omit it.
 *
 * Usage:
 *   const comments = await bffFetch<Comment[]>("/api/collab/comments?...");
 *   await bffFetch("/api/collab/comments", { method: "POST", body: { ... } });
 */

export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}

export interface BffFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class BffError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BffError";
  }
}

function captureTraceId(response: Response): void {
  const traceId = response.headers.get("X-Trace-ID");
  if (traceId && /^[0-9a-f]{32}$/i.test(traceId)) {
    Sentry.getCurrentScope().setTag("trace_id", traceId.toLowerCase());
  }
}

export async function bffFetch<T = unknown>(
  url: string,
  options: BffFetchOptions = {},
  timeoutMs = 30_000,
): Promise<T> {
  const { method = "GET", body, headers = {}, signal } = options;

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const init: RequestInit = {
    method,
    signal: effectiveSignal,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  // Attach CSRF token for all mutating methods
  if (method !== "GET") {
    (init.headers as Record<string, string>)["X-CSRF-Token"] = getCsrfToken();
  }

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  captureTraceId(res);

  if (!res.ok) {
    let message = res.statusText;
    try {
      const err = (await res.json()) as { error?: string; message?: string };
      message = err.error ?? err.message ?? message;
    } catch {
      // ignore parse failure
    }
    throw new BffError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
