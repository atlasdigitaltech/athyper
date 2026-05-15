import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@athyper/auth";
import { decideHostGuard } from "./lib/host-guard";

/**
 * Next.js middleware — runs on every request before route handlers.
 *
 * Controls (in order):
 *   1. CSRF protection (double-submit cookie pattern) for mutating /api/* routes
 *   2. Session gate — redirect unauthenticated users to /login
 *   3. MFA gate — redirect to /mfa/challenge when MFA is pending
 *   4. Root redirect — / → /home
 *   5. Locale detection — set neon_locale cookie from accept-language
 *
 * x-pathname header is forwarded on all requests so Server Components
 * can read the current path without client-side JS.
 */

const CSRF_COOKIE = "__csrf";
const LOCALE_COOKIE = "neon_locale";
const SUPPORTED_LOCALES = new Set(["en", "ms", "ta", "hi", "ar", "fr", "de"]);
const DEFAULT_LOCALE = "en";

// ── F8 Phase 1: Single-ingress host guard ───────────────────────────────────
// Reject requests whose Host header does not match the expected gateway origin.
// Page requests redirect; API/fetch requests get a JSON 421.
// ALLOWED_HOSTS is a comma-separated list of valid Host values (no scheme/port).
// Set ALLOW_DIRECT_ACCESS=true to disable the guard for debugging.
const ALLOW_DIRECT_ACCESS = process.env.ALLOW_DIRECT_ACCESS === "true";
const ALLOWED_HOSTS: Set<string> = new Set(
  (process.env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
// Gateway origin for redirects — derived from the first allowed host.
const GATEWAY_ORIGIN = process.env.GATEWAY_ORIGIN ?? "";

// HTTP methods that modify state — only these require CSRF protection.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// All /api/auth/* routes are already intercepted by the public-bypass block
// above and never reach the CSRF check. This constant is kept as a
// defensive guard so that the CSRF condition is self-documenting even if
// the bypass order ever changes.
const CSRF_EXEMPT_PREFIX = "/api/auth/";

// Routes where MFA has not yet been verified are still allowed.
const MFA_EXEMPT_PREFIXES = [
  "/mfa/",
  "/api/auth/mfa/",
  "/api/auth/logout",
  "/api/auth/session",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Forward the current pathname as a request header so Server Components
  // can read it without client-side JS (e.g. shell layout session gate).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // ── F8 Phase 1: Host-header guard (single-ingress enforcement) ────────────
  // Defence-in-depth — the primary enforcement is network topology (Phase 2).
  // Decision is a pure function in lib/host-guard.ts so it can be unit-tested
  // without next/server. Response shaping stays here.
  const guard = decideHostGuard({
    host: request.headers.get("host"),
    allowedHosts: ALLOWED_HOSTS,
    allowDirectAccess: ALLOW_DIRECT_ACCESS,
  });
  if (guard.action === "reject") {
    // API/fetch requests → JSON 421 with the gateway URL
    if (pathname.startsWith("/api/") || request.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json(
        {
          error: "INVALID_HOST",
          message: `Direct access is not supported. Use the gateway: ${GATEWAY_ORIGIN || "see ALLOWED_HOSTS config"}`,
        },
        { status: 421 },
      );
    }
    // Browser page requests → redirect to gateway origin
    if (GATEWAY_ORIGIN) {
      return NextResponse.redirect(
        new URL(pathname + request.nextUrl.search, GATEWAY_ORIGIN),
      );
    }
    // No gateway origin configured — return a plain text error
    return new NextResponse(
      "Direct access is not supported. Access the application through the gateway.",
      { status: 421, headers: { "Content-Type": "text/plain" } },
    );
  }

  // ── Public routes — skip session + MFA checks ──────────────────────────────
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/logout") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next") ||
    (pathname === "/platform" || pathname.startsWith("/platform/")) ||
    pathname === "/health"
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── CSRF enforcement for mutating non-auth API requests ────────────────────
  // Protects business API routes (/api/anything-except-auth) from
  // cross-site request forgery via the double-submit cookie pattern.
  if (
    pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(method) &&
    !pathname.startsWith(CSRF_EXEMPT_PREFIX)
  ) {
    const csrfHeader = request.headers.get("x-csrf-token");
    const csrfCookie = request.cookies.get(CSRF_COOKIE)?.value;

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return NextResponse.json(
        {
          error: "CSRF_VALIDATION_FAILED",
          message: "Missing or invalid CSRF token",
        },
        { status: 403 },
      );
    }
  }

  // ── Non-auth API routes pass through after CSRF ────────────────────────────
  // API routes manage their own session auth via getApiContext() / BFF.
  // Letting them handle auth directly ensures proper JSON error responses
  // rather than HTML login-page redirects.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── Session gate ───────────────────────────────────────────────────────────
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    const originalPath = pathname + request.nextUrl.search;
    if (originalPath !== "/") {
      loginUrl.searchParams.set("redirect", originalPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  // ── MFA gate ───────────────────────────────────────────────────────────────
  // neon_mfa_pending=1 is set by the auth callback when mfaRequired=true
  // and cleared by the MFA verify route after successful TOTP.
  // This is an Edge-compatible lightweight check — Redis session is authoritative.
  const mfaPending = request.cookies.get("neon_mfa_pending")?.value;
  if (
    mfaPending === "1" &&
    !MFA_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const mfaUrl = new URL("/mfa/challenge", request.url);
    mfaUrl.searchParams.set("returnUrl", pathname);
    return NextResponse.redirect(mfaUrl);
  }

  // ── Redirect root to /dashboard ───────────────────────────────────────────
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Locale detection ───────────────────────────────────────────────────────
  // Set neon_locale cookie from accept-language header if not yet present.
  // JS-readable (httpOnly: false) so client-side i18n can consume it.
  const existingLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!existingLocale) {
    const acceptLang = request.headers.get("accept-language") ?? "";
    const preferred = acceptLang
      .split(",")
      .map((part) => (part.split(";")[0] ?? "").trim().split("-")[0]?.toLowerCase() ?? "")
      .find((lang) => SUPPORTED_LOCALES.has(lang));

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set(LOCALE_COOKIE, preferred ?? DEFAULT_LOCALE, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - livez (F8 Phase 3 — liveness probe must bypass host-guard and all
     *   session/CSRF checks; Docker healthcheck hits localhost:3000/livez
     *   which does not carry the gateway host header)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|livez).*)",
  ],
};
