import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@athyper/auth";

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

// HTTP methods that modify state — only these require CSRF protection.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// All /api/auth/* routes are exempt from CSRF — they run before a session
// is fully established (login, callback) or perform session destruction
// (logout, refresh). These routes all require their own auth checks.
const CSRF_EXEMPT_PREFIX = "/api/auth/";

// Routes where MFA has not yet been verified are still allowed.
const MFA_EXEMPT_PREFIXES = [
  "/mfa/",
  "/api/auth/mfa/",
  "/api/auth/logout",
  "/api/auth/session",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Forward the current pathname as a request header so Server Components
  // can read it without client-side JS (e.g. shell layout session gate).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // ── Public routes — skip session + MFA checks ──────────────────────────────
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/logout") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/platform") ||
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

  // ── Redirect root to /home ─────────────────────────────────────────────────
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  // ── Locale detection ───────────────────────────────────────────────────────
  // Set neon_locale cookie from accept-language header if not yet present.
  // JS-readable (httpOnly: false) so client-side i18n can consume it.
  const existingLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!existingLocale) {
    const acceptLang = request.headers.get("accept-language") ?? "";
    const preferred = acceptLang
      .split(",")
      .map((part) => (part.split(";")[0] ?? part).trim().split("-")[0]?.toLowerCase() ?? "")
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
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
