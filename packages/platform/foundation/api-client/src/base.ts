/**
 * @athyper/platform-api-client — Base Fetch
 *
 * Production-grade authenticated HTTP wrapper.
 * Upgrades over POC:
 *   - Per-request timeout via AbortSignal.timeout
 *   - Automatic retry with backoff for idempotent GET/HEAD (429/502/503/504)
 *   - Token refresh on 401 with deduplication (one refresh per concurrent burst)
 *   - X-Request-Id correlation header on every request
 *   - Defensive error body parsing (three envelope shapes)
 *   - Optional onError hook for telemetry (Sentry / OTel)
 */

export interface RetryConfig {
  /** How many additional attempts after the first failure. Default: 1 */
  attempts: number;
  /** Base delay in ms between attempts (doubles each retry). Default: 500 */
  delayMs:  number;
  /** HTTP status codes that trigger a retry on idempotent methods. Default: [429, 502, 503, 504] */
  retryOn:  number[];
}

export interface FetchConfig {
  baseUrl:       string;
  accessToken:   string;
  tenantId:      string;
  locale?:       string;
  /** Default AbortSignal applied to every request — use to cancel all in-flight on logout/tenant switch. */
  signal?:       AbortSignal;
  /** Per-request timeout in ms. Default: 30 000 */
  timeoutMs?:    number;
  retry?:        Partial<RetryConfig>;
  /**
   * Called when the server returns 401. Should return a fresh access token or
   * throw to signal an unrecoverable session (callers should redirect to login).
   * Only one refresh will be in-flight at a time even under concurrent 401s.
   */
  refreshToken?: () => Promise<string>;
  /** Telemetry hook — receives the final ApiError and the X-Request-Id that failed. */
  onError?:      (err: ApiError, requestId: string) => void;
}

export class ApiError extends Error {
  constructor(
    public status:     number,
    public code:       string,
    message:           string,
    public details?:   Record<string, unknown>,
    public requestId?: string,
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
  if (baseUrl.endsWith("/") && path.startsWith("/")) return `${baseUrl.slice(0, -1)}${path}`;
  if (!baseUrl.endsWith("/") && !path.startsWith("/")) return `${baseUrl}/${path}`;
  return `${baseUrl}${path}`;
}

function hasNativeContentType(body: BodyInit): boolean {
  if (typeof FormData       !== "undefined" && body instanceof FormData)       return true;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return true;
  if (typeof Blob           !== "undefined" && body instanceof Blob)           return true;
  if (typeof ArrayBuffer    !== "undefined" && body instanceof ArrayBuffer)    return true;
  if (ArrayBuffer.isView(body)) return true;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) return true;
  return false;
}

function shouldSetJsonContentType(body: BodyInit | null | undefined): boolean {
  return body != null && !hasNativeContentType(body);
}

function isRetryableMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

function parseErrorBody(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
): ApiError {
  // Shape 1: { errors: [{ code, message, details }] }
  if (Array.isArray(body["errors"]) && (body["errors"] as unknown[]).length > 0) {
    const first = (body["errors"] as Record<string, unknown>[])[0]!;
    return new ApiError(
      status,
      String(first["code"]    ?? "UNKNOWN"),
      String(first["message"] ?? "Request failed"),
      first["details"] != null && typeof first["details"] === "object"
        ? (first["details"] as Record<string, unknown>)
        : undefined,
      requestId,
    );
  }
  // Shape 2: { error: string, code?: string }
  if (typeof body["error"] === "string") {
    return new ApiError(
      status,
      String(body["code"]  ?? "UNKNOWN"),
      body["error"],
      undefined,
      requestId,
    );
  }
  // Shape 3: { message: string }
  if (typeof body["message"] === "string") {
    return new ApiError(status, "UNKNOWN", body["message"], undefined, requestId);
  }
  return new ApiError(status, "UNKNOWN", `HTTP ${status}`, undefined, requestId);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createFetch(config: FetchConfig) {
  const {
    baseUrl,
    tenantId,
    locale,
    signal: defaultSignal,
    timeoutMs   = 30_000,
    onError,
  } = config;

  const retryConfig: RetryConfig = {
    attempts: config.retry?.attempts ?? 1,
    delayMs:  config.retry?.delayMs  ?? 500,
    retryOn:  config.retry?.retryOn  ?? [429, 502, 503, 504],
  };

  // One outstanding refresh at a time — prevents token refresh storms
  let _refreshPromise: Promise<string> | null = null;

  // Mutable accessor for the current token — updated after a successful refresh
  let _currentToken = config.accessToken;

  function getToken(): string {
    return _currentToken;
  }

  async function attemptRefresh(): Promise<string> {
    if (!config.refreshToken) throw new ApiError(401, "UNAUTHORIZED", "Session expired");
    if (!_refreshPromise) {
      _refreshPromise = config.refreshToken().then(
        (token) => { _currentToken = token; return token; },
        (err) => { throw err; },
      ).finally(() => { _refreshPromise = null; });
    }
    return _refreshPromise;
  }

  async function executeRequest<T>(
    path: string,
    options: RequestInit & { signal?: AbortSignal; timeoutMs?: number },
    requestId: string,
    token: string,
  ): Promise<T> {
    const url      = joinUrl(baseUrl, path);
    const timeout  = options.timeoutMs ?? timeoutMs;
    const headers  = new Headers(options.headers);

    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Tenant-Id",   tenantId);
    headers.set("X-Request-Id",  requestId);
    if (shouldSetJsonContentType(options.body) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (locale) headers.set("Accept-Language", locale);

    const signals: AbortSignal[] = [AbortSignal.timeout(timeout)];
    if (options.signal)  signals.push(options.signal);
    if (defaultSignal)   signals.push(defaultSignal);
    const signal = signals.length === 1 ? signals[0]! : AbortSignal.any(signals);

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers, signal });
    } catch (err) {
      throw new ApiError(
        0,
        err instanceof Error && err.name === "AbortError" ? "ABORTED" : "NETWORK_ERROR",
        err instanceof Error ? err.message : "Network request failed",
        undefined,
        requestId,
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      // Read Retry-After for 429 so callers can act on it; attach to details
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) (body as Record<string, unknown>)["retry_after"] = retryAfter;
      }
      throw parseErrorBody(body, response.status, requestId);
    }

    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }

    const text = await response.text();
    if (!text.trim()) return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(response.status, "PARSE_ERROR", "Failed to parse response body", undefined, requestId);
    }
  }

  return async function apiFetch<T>(
    path:    string,
    options: RequestInit & { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<T> {
    const requestId = generateRequestId();
    const method    = options.method ?? "GET";
    let   lastError: ApiError | null = null;
    const maxAttempts = 1 + (isRetryableMethod(method) ? retryConfig.attempts : 0);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await executeRequest<T>(path, options, requestId, getToken());
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        lastError = err;

        // 401: attempt token refresh, retry once regardless of method
        if (err.status === 401 && attempt === 0) {
          try {
            await attemptRefresh();
            continue;
          } catch {
            break;
          }
        }

        // Retriable status on idempotent method
        if (
          isRetryableMethod(method) &&
          retryConfig.retryOn.includes(err.status) &&
          attempt < maxAttempts - 1
        ) {
          const retryAfterMs = err.status === 429 && err.details?.["retry_after"]
            ? Number(err.details["retry_after"]) * 1000
            : retryConfig.delayMs * Math.pow(2, attempt);
          await delay(retryAfterMs);
          continue;
        }

        break;
      }
    }

    onError?.(lastError!, requestId);
    throw lastError!;
  };
}

export type ApiFetch = ReturnType<typeof createFetch>;
