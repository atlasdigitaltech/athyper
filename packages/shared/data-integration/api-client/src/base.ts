/**
 * @athyper/api-client — Base Fetch
 *
 * Authenticated HTTP wrapper. Injects auth token and tenant context
 * into every request to the backend API.
 *
 * SCOPE: Pure HTTP layer. No caching, no query keys, no React.
 * Those belong in packages/query and packages/metadata-client.
 */

export interface FetchConfig {
  /** Backend API base URL */
  baseUrl: string;
  /** Access token from session */
  accessToken: string;
  /** Tenant ID from session */
  tenantId: string;
  /** Locale from session */
  locale?: string;
  /**
   * Default AbortSignal applied to every request created from this instance.
   * Useful for cancelling all in-flight requests on logout / tenant switch.
   * Can be overridden per-request via the options argument of apiFetch.
   */
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Encode one dynamic URL path segment without touching route separators. */
export function encodePathSegment(segment: string | number): string {
  return encodeURIComponent(String(segment));
}

function joinUrl(baseUrl: string, path: string): string {
  if (baseUrl.endsWith("/") && path.startsWith("/")) {
    return `${baseUrl.slice(0, -1)}${path}`;
  }
  if (!baseUrl.endsWith("/") && !path.startsWith("/")) {
    return `${baseUrl}/${path}`;
  }
  return `${baseUrl}${path}`;
}

function hasNativeContentType(body: BodyInit): boolean {
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return true;
  if (typeof Blob !== "undefined" && body instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(body)) return true;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) return true;
  return false;
}

function shouldSetJsonContentType(body: BodyInit | null | undefined): boolean {
  return body !== undefined && body !== null && !hasNativeContentType(body);
}

/**
 * Create an authenticated fetch function scoped to a session.
 */
export function createFetch(config: FetchConfig) {
  const { baseUrl, accessToken, tenantId, locale, signal: defaultSignal } = config;

  return async function apiFetch<T>(
    path: string,
    options: RequestInit & { signal?: AbortSignal } = {},
  ): Promise<T> {
    const url = joinUrl(baseUrl, path);

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("X-Tenant-Id", tenantId);
    // Default string bodies to JSON for this package's typed clients, but do
    // not override multipart, URL-encoded, binary, streaming, or explicit types.
    if (shouldSetJsonContentType(options.body) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (locale) headers.set("Accept-Language", locale);

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: options.signal ?? defaultSignal,
      });
    } catch (err) {
      // Network-level failure: no connection, DNS error, CORS abort, request cancelled.
      throw new ApiError(
        0,
        err instanceof Error && err.name === "AbortError" ? "ABORTED" : "NETWORK_ERROR",
        err instanceof Error ? err.message : "Network request failed",
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const errors = Array.isArray(body["errors"]) ? body["errors"] as Record<string, unknown>[] : [];
      const first = errors[0];
      throw new ApiError(
        response.status,
        String(first?.["code"] ?? "UNKNOWN"),
        String(first?.["message"] ?? response.statusText),
        first?.["details"] != null && typeof first["details"] === "object"
          ? first["details"] as Record<string, unknown>
          : undefined,
      );
    }

    // 204 No Content or explicit empty body — do not attempt JSON parse.
    // DELETE, void-returning transitions, and submitAction all hit this path.
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }

    // Void endpoints may return 200 with an empty body and no content-length.
    const text = await response.text();
    if (!text.trim()) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(response.status, "PARSE_ERROR", "Failed to parse response body");
    }
  };
}

export type ApiFetch = ReturnType<typeof createFetch>;
