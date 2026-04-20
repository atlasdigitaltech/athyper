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

/**
 * Create an authenticated fetch function scoped to a session.
 */
export function createFetch(config: FetchConfig) {
  const { baseUrl, accessToken, tenantId, locale } = config;

  return async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${baseUrl}${path}`;

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("X-Tenant-Id", tenantId);
    headers.set("Content-Type", "application/json");
    if (locale) headers.set("Accept-Language", locale);

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err) {
      // Network-level failure: no connection, DNS error, CORS abort, etc.
      throw new ApiError(
        0,
        "NETWORK_ERROR",
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

    try {
      return await (response.json() as Promise<T>);
    } catch {
      throw new ApiError(response.status, "PARSE_ERROR", "Failed to parse response body");
    }
  };
}

export type ApiFetch = ReturnType<typeof createFetch>;
