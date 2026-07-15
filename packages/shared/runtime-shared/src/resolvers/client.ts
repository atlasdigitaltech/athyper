/**
 * Client-side resolver adapter.
 *
 * Posts to the BFF resolver endpoint (`runtimePath.resolver(code)`) and
 * returns the resolved value, or null if the resolver fails / returns null.
 *
 * Used by the form runtime's `client_on_change` executor when an
 * `on_source_change.action="rederive"` intent fires.
 *
 * Spec: docs/specs/source-change-resolver-registry.md
 */

import { runtimePath } from "@athyper/api-contracts/runtime-paths";

export interface CallResolverOptions {
  signal?: AbortSignal;
  /** Optional CSRF token to include in the X-CSRF-Token header. */
  csrfToken?: string;
}

export type ResolverErrorReason =
  | "network"
  | "not_found"
  | "missing_inputs"
  | "invalid_inputs"
  | "failed";

export interface ResolverError {
  reason:  ResolverErrorReason;
  status?: number;
  message: string;
}

export interface ResolverResponse {
  value: unknown | null;
  error?: ResolverError;
}

/**
 * Invokes the named resolver via BFF. On any failure returns
 * `{ value: null, error }` — callers treat "no value" the same regardless of
 * cause, but can inspect `error` for diagnostics.
 */
export async function callResolver(
  code:   string,
  inputs: Record<string, unknown>,
  opts?:  CallResolverOptions,
): Promise<ResolverResponse> {
  const url = runtimePath.resolver(code);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.csrfToken) headers["X-CSRF-Token"] = opts.csrfToken;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs }),
      signal: opts?.signal,
    });
  } catch (err) {
    return {
      value: null,
      error: {
        reason:  "network",
        message: err instanceof Error ? err.message : "Network error",
      },
    };
  }

  if (response.status === 404) {
    return { value: null, error: { reason: "not_found", status: 404, message: "Resolver not found" } };
  }
  if (response.status === 400) {
    const body = await safeJson(response);
    return {
      value: null,
      error: {
        reason:  "missing_inputs",
        status:  400,
        message: typeof body?.["message"] === "string" ? body["message"] : "Missing inputs",
      },
    };
  }
  if (response.status === 422) {
    return { value: null, error: { reason: "invalid_inputs", status: 422, message: "Invalid input shape" } };
  }
  if (!response.ok) {
    return { value: null, error: { reason: "failed", status: response.status, message: `Resolver failed (${response.status})` } };
  }

  const body = await safeJson(response);
  if (!body || !("value" in body)) {
    return { value: null, error: { reason: "failed", status: response.status, message: "Resolver returned malformed body" } };
  }
  return { value: body["value"] ?? null };
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}
