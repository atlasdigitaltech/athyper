// middleware.ts
//
// Next.js Edge Middleware — runs on every request before route handlers.
//
// Two security controls:
//   1. CSRF Protection (double-submit cookie pattern)
//   2. Session Gate (cookie presence check)

import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

const SID_COOKIE = "neon_sid";
const LOCALE_COOKIE = "neon_locale";
const SUPPORTED_LOCALES = new Set(["en", "ms", "ta", "hi", "ar", "fr", "de"]);
const DEFAULT_LOCALE = "en";

// Routes that don't require a session cookie.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/user_login",
  "/admin_login",
  "/partner_login",
  "/ops_login",
  "/callback",
  "/logout",
  "/health",
  "/wb/select",
  "/wb/unauthorized",
  "/wb/forbidden",
  "/platform-login",
]);

// Routes that are allowed while MFA is pending (not yet verified).
const MFA_EXEMPT_PREFIXES = [
  "/mfa/",
  "/api/auth/mfa/",
  "/api/auth/logout",
  "/api/auth/session",
];

// Prefix-based public paths
const PUBLIC_PREFIXES = ["/public/"];

// Routes exempt from CSRF validation.
const CSRF_EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/platform-login",
  "/api/auth/callback",
]);

// HTTP methods that modify state — only these require CSRF protection.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Forward the current pathname as a request header so Server Components
  // (e.g. the shell layout session gate) can read it without client-side JS.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  // ─── CSRF enforcement for mutating API requests ──────────────
  if (
    pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(method) &&
    !CSRF_EXEMPT_PATHS.has(pathname)
  ) {
    const csrfHeader = req.headers.get("x-csrf-token");
    const csrfCookie = req.cookies.get("__csrf")?.value;

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

  // ─── API routes pass through ─────────────────────────────────
  // All API routes manage their own authentication via getApiContext().
  // CSRF enforcement (above) already protects mutating requests.
  // Letting API routes handle auth directly ensures they return proper
  // JSON/text error responses instead of HTML redirects from the session gate.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ─── Public routes ───────────────────────────────────────────
  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ─── Session gate for protected routes ───────────────────────
  const sid = req.cookies.get(SID_COOKIE)?.value;

  if (!sid) {
    // Platform admin paths require platform-control realm login
    if (pathname.startsWith("/platform")) {
      const url = req.nextUrl.clone();
      url.pathname = "/ops_login";
      return NextResponse.redirect(url);
    }

    // Redirect to root landing page so users can choose their login type
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // ─── MFA gate for protected routes ────────────────────────────
  // If the session requires MFA and it hasn't been verified yet,
  // redirect to /mfa/challenge. The neon_mfa cookie is set by the
  // MFA verify BFF route after successful TOTP verification. This
  // is a lightweight Edge-compatible check — the server-side session
  // in Redis is the authoritative source (checked by BFF routes).
  const mfaPending = req.cookies.get("neon_mfa_pending")?.value;
  if (
    mfaPending === "1" &&
    !MFA_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const mfaUrl = req.nextUrl.clone();
    mfaUrl.pathname = "/mfa/challenge";
    mfaUrl.searchParams.set("returnUrl", pathname);
    return NextResponse.redirect(mfaUrl);
  }

  // ─── Locale detection ─────────────────────────────────────────
  const existingLocale = req.cookies.get(LOCALE_COOKIE)?.value;
  if (!existingLocale) {
    const acceptLang = req.headers.get("accept-language") ?? "";
    const preferred = acceptLang
      .split(",")
      .map((part) => part.split(";")[0].trim().split("-")[0].toLowerCase())
      .find((lang) => SUPPORTED_LOCALES.has(lang));

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
