"use client";

// lib/finance/fetcher.ts
//
// Shared fetch helpers for the Finance module.
// CSRF via buildHeaders() from the existing session bootstrap.
// All errors are thrown as FinanceHttpError for consistent handling.

import { FinanceHttpError } from "./errors";

import { buildHeaders } from "@/lib/schema-manager/use-csrf";

/**
 * Typed GET request with CSRF headers and FinanceHttpError on failure.
 */
export async function finGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: buildHeaders(),
    credentials: "same-origin",
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({
      code: "UNKNOWN",
      message: `Request failed (${res.status})`,
    }));
    throw new FinanceHttpError(res.status, body.error ?? body);
  }

  const json = await res.json();
  // API routes wrap responses as { success, data }; unwrap transparently.
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

/**
 * Typed POST request with JSON body, CSRF headers, and FinanceHttpError on failure.
 */
export async function finPost<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...buildHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({
      code: "UNKNOWN",
      message: `Request failed (${res.status})`,
    }));
    throw new FinanceHttpError(res.status, errBody.error ?? errBody);
  }

  const json = await res.json();
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

/**
 * Typed PATCH request with JSON body, CSRF headers, and FinanceHttpError on failure.
 */
export async function finPatch<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...buildHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({
      code: "UNKNOWN",
      message: `Request failed (${res.status})`,
    }));
    throw new FinanceHttpError(res.status, errBody.error ?? errBody);
  }

  const json = await res.json();
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

/**
 * Typed PUT request with JSON body, CSRF headers, and FinanceHttpError on failure.
 */
export async function finPut<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...buildHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({
      code: "UNKNOWN",
      message: `Request failed (${res.status})`,
    }));
    throw new FinanceHttpError(res.status, errBody.error ?? errBody);
  }

  const json = await res.json();
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

/**
 * Typed DELETE request with CSRF headers and FinanceHttpError on failure.
 */
export async function finDelete<T = void>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: "DELETE",
    headers: buildHeaders(),
    credentials: "same-origin",
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({
      code: "UNKNOWN",
      message: `Request failed (${res.status})`,
    }));
    throw new FinanceHttpError(res.status, errBody.error ?? errBody);
  }

  // Some DELETE endpoints return 204 with no body
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}
