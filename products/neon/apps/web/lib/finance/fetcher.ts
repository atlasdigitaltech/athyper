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

  return res.json() as Promise<T>;
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

  return res.json() as Promise<T>;
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

  return res.json() as Promise<T>;
}
