import { type NextRequest, NextResponse } from "next/server";
import { i18nConfig } from "@athyper/i18n/config";
import { decideHostGuard, getPlaneConfig, LOCALE_COOKIE_MAX_AGE_SECONDS } from "@athyper/session-plane";
import { isForbiddenPath, isPublicPath } from "@athyper/app-mesh-route-manifest";
import { PLANE_KEY } from "./lib/plane";

const plane = getPlaneConfig(PLANE_KEY);
const SUPPORTED_LOCALES = new Set<string>(i18nConfig.locales);
const DEFAULT_LOCALE = i18nConfig.defaultLocale;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOW_DIRECT_ACCESS = process.env.ALLOW_DIRECT_ACCESS === "true";
const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);
const GATEWAY_ORIGIN = process.env.GATEWAY_ORIGIN ?? "";

function readCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasMatchingCsrfCookie(request: NextRequest, cookieName: string, headerToken: string | null): boolean {
  if (!headerToken) return false;

  const selectedCookie = request.cookies.get(cookieName)?.value;
  if (selectedCookie && readCookieValue(selectedCookie) === headerToken) return true;

  const rawCookie = request.headers.get("cookie") ?? "";
  return rawCookie.split(";").some((part) => {
    const [name, ...valueParts] = part.trim().split("=");
    return name === cookieName && readCookieValue(valueParts.join("=")) === headerToken;
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-plane", plane.key);
  requestHeaders.set("x-search", request.nextUrl.search);

  const guard = decideHostGuard({
    host: request.headers.get("host"),
    allowedHosts: ALLOWED_HOSTS,
    allowDirectAccess: ALLOW_DIRECT_ACCESS,
  });
  if (guard.action === "reject") {
    if (pathname.startsWith("/api/") || request.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json({ error: "INVALID_HOST", plane: plane.key }, { status: 421 });
    }
    if (GATEWAY_ORIGIN) {
      return NextResponse.redirect(new URL(pathname + request.nextUrl.search, GATEWAY_ORIGIN));
    }
    return new NextResponse("Direct access is not supported.", { status: 421 });
  }

  if (isPublicPath(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isForbiddenPath(pathname)) {
    return new NextResponse("Route is not available in this plane.", { status: 404 });
  }

  if (pathname.startsWith("/api/") && MUTATING_METHODS.has(request.method) && !pathname.startsWith("/api/auth/")) {
    const csrfHeader = request.headers.get("x-csrf-token");
    if (!hasMatchingCsrfCookie(request, plane.csrfCookieName, csrfHeader)) {
      return NextResponse.json({ error: "CSRF_VALIDATION_FAILED", plane: plane.key }, { status: 403 });
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const sessionCookie = request.cookies.get(plane.cookieName);
  if (!sessionCookie) {
    const loginUrl = new URL(plane.loginPath, request.url);
    const originalPath = pathname + request.nextUrl.search;
    if (originalPath !== "/") loginUrl.searchParams.set("returnUrl", originalPath);
    return NextResponse.redirect(loginUrl);
  }

  const mfaPending = request.cookies.get(plane.mfaPendingCookieName)?.value;
  if (mfaPending === "1" && !pathname.startsWith("/mfa/") && !pathname.startsWith("/api/auth/mfa/")) {
    const mfaUrl = new URL("/mfa/challenge", request.url);
    const selectParams = new URLSearchParams();
    selectParams.set("returnUrl", pathname + request.nextUrl.search);
    mfaUrl.searchParams.set("returnUrl", `/auth/select?${selectParams.toString()}`);
    return NextResponse.redirect(mfaUrl);
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(plane.defaultPath, request.url));
  }

  const existingLocale = request.cookies.get(plane.localeCookieName)?.value;
  if (!existingLocale) {
    const acceptLang = request.headers.get("accept-language") ?? "";
    const preferred = acceptLang
      .split(",")
      .map((part) => (part.split(";")[0] ?? "").trim().split("-")[0]?.toLowerCase() ?? "")
      .find((lang) => SUPPORTED_LOCALES.has(lang));

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set(plane.localeCookieName, preferred ?? DEFAULT_LOCALE, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon\\.ico|icon\\.svg|livez).*)"],
};
