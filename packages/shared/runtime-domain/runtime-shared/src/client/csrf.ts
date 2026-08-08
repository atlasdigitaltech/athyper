/**
 * Plane-aware client-side BFF utilities.
 *
 *   setBffClientPlane(plane)   — one-time bootstrap, called from each app's
 *                                providers.tsx so cookie reads find the right
 *                                plane-specific csrf cookie name (neon: __csrf,
 *                                mesh: __mesh_csrf, admin: __admin_csrf).
 *   getCsrfToken()             — reads the configured cookie.
 *   csrfFetch(input, init)     — low-level wrapper; attaches X-CSRF-Token for
 *                                mutating requests, returns the raw Response.
 *   bffFetch<T>(url, options)  — high-level; parses JSON, throws BffError on !ok.
 *   relayMutate(path, options) — convenience for /api/relay BFF calls.
 *   BffError                   — error class with status code and message.
 */
import {
  getPlaneConfig,
  type PlaneKey,
  cookieNamesWithHostPrefix,
} from "@athyper/session-plane";

// ─── Plane registration ──────────────────────────────────────────────────────

let configuredPlane: PlaneKey | null = null;

/**
 * Called once at app boot (typically inside providers.tsx) so the client knows
 * which plane it is running in and which csrf cookie name to read. Idempotent
 * — calling with the same plane key is a no-op; calling with a different key
 * warns but accepts the new value (HMR-safe).
 */
export function setBffClientPlane(plane: PlaneKey): void {
  if (configuredPlane && configuredPlane !== plane) {
    // eslint-disable-next-line no-console
    console.warn(`[bff-client] plane changed from ${configuredPlane} to ${plane}`);
  }
  configuredPlane = plane;
}

function resolveCookieName(): string {
  if (configuredPlane) return getPlaneConfig(configuredPlane).csrfCookieName;
  // Pre-bootstrap fallback. Acceptable in dev where the legacy hardcoded
  // behavior matches neon; mesh and admin must call setBffClientPlane() early
  // or csrf reads will silently miss the right cookie.
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      "[bff-client] csrf accessed before setBffClientPlane() — falling back to __csrf. " +
        "Add setBffClientPlane(PLANE_KEY) at the top of your providers.tsx.",
    );
  }
  return "__csrf";
}

function resolveCookieCandidates(): string[] {
  return cookieNamesWithHostPrefix(resolveCookieName());
}

function readCsrfToken(cookieNames: readonly string[]): string {
  if (typeof document === "undefined") return "";
  for (const cookieName of cookieNames) {
    const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`),
    );
    if (match) return decodeURIComponent(match[1] ?? "");
  }
  return "";
}

export interface PlaneBffClient {
  getCsrfToken(): string;
}

/**
 * Binds cookie lookup to one plane while registering that plane for existing
 * unbound shared clients.
 */
export function createPlaneBffClient(plane: PlaneKey): PlaneBffClient {
  setBffClientPlane(plane);
  const cookieNames = cookieNamesWithHostPrefix(
    getPlaneConfig(plane).csrfCookieName,
  );
  return {
    getCsrfToken: () => readCsrfToken(cookieNames),
  };
}

// ─── Token reading ───────────────────────────────────────────────────────────

export function getCsrfToken(): string {
  return readCsrfToken(resolveCookieCandidates());
}

// ─── Low-level: raw Response ─────────────────────────────────────────────────

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * fetch() wrapper that attaches X-CSRF-Token for mutating requests. Returns
 * the raw Response — callers decide how to parse the body. Use this when you
 * need streamed responses, blob downloads, or non-JSON content types.
 */
export function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return fetch(input, init);

  const headers = new Headers(init.headers);
  const token = getCsrfToken();
  if (token) headers.set("X-CSRF-Token", token);
  return fetch(input, { ...init, headers });
}

// ─── High-level: parsed JSON + error class ───────────────────────────────────

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

/**
 * Convenience client for BFF JSON endpoints. Attaches the CSRF token on
 * mutations, JSON-encodes the body, parses the response, and throws BffError
 * with the upstream status when the response is not OK.
 */
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

  if (MUTATING_METHODS.has(method)) {
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
      const code = typeof err.error === "string" ? err.error : "";
      const detail = typeof err.message === "string" ? err.message.trim() : "";
      message = code && detail && detail !== code
        ? `${code}: ${detail}`
        : code || detail || message;
    } catch {
      // ignore parse failure
    }
    throw new BffError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Relay convenience ───────────────────────────────────────────────────────

/**
 * fetch() wrapper that prepends the /api/relay prefix and attaches X-CSRF-Token
 * for mutating requests. Preserved for existing call sites; new code should
 * prefer `bffFetch` (JSON) or `csrfFetch` (raw).
 */
export async function relayMutate(
  path: string,
  options: RequestInit & { method: "POST" | "PATCH" | "PUT" | "DELETE" },
): Promise<Response> {
  const headers = new Headers(options.headers as HeadersInit | undefined);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-CSRF-Token", getCsrfToken());
  return fetch(`/api/relay${path}`, { ...options, headers });
}
