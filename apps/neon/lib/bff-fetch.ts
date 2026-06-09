"use client";

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

export async function bffFetch<T = unknown>(
  url: string,
  options: BffFetchOptions = {},
): Promise<T> {
  const { method = "GET", body, headers = {}, signal } = options;

  const init: RequestInit = {
    method,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (method !== "GET") {
    (init.headers as Record<string, string>)["X-CSRF-Token"] = getCsrfToken();
  }

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

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

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
