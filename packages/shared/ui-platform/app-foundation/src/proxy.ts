import { type NextRequest, NextResponse } from "next/server";
import {
  cookieNamesWithHostPrefix,
  decideHostGuard,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  readCookieWithHostPrefix,
  type PlaneConfig,
} from "@athyper/platform-iam-session-plane";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface PlaneProxyLocaleConfig {
  locales: Iterable<string>;
  defaultLocale: string;
}

export interface PlaneProxyHostGuardSettings {
  allowDirectAccess: boolean;
  allowedHosts: ReadonlySet<string>;
  gatewayOrigin: string;
}

export interface PlaneProxyOptions {
  plane: PlaneConfig;
  isPublicPath: (pathname: string) => boolean;
  isForbiddenPath: (pathname: string) => boolean;
  locale: PlaneProxyLocaleConfig;
  hostGuard: PlaneProxyHostGuardSettings;
}

export type PlaneProxyHandler = (request: NextRequest) => NextResponse;

/**
 * Converts app environment values into an explicit, injectable host-guard
 * configuration. Keeping this out of createPlaneProxy makes middleware
 * behavior deterministic in tests and prevents every plane from reimplementing
 * environment parsing.
 */
export function createPlaneProxyHostGuardSettings(
  environment: Record<string, string | undefined>,
): PlaneProxyHostGuardSettings {
  return {
    allowDirectAccess: environment.ALLOW_DIRECT_ACCESS === "true",
    allowedHosts: new Set(
      (environment.ALLOWED_HOSTS ?? "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
    gatewayOrigin: environment.GATEWAY_ORIGIN ?? "",
  };
}

function readCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasMatchingCsrfCookie(
  request: NextRequest,
  cookieNameCandidates: string[],
  headerToken: string | null,
): boolean {
  if (!headerToken) return false;

  for (const cookieName of cookieNameCandidates) {
    const selectedCookie = request.cookies.get(cookieName)?.value;
    if (selectedCookie && readCookieValue(selectedCookie) === headerToken) return true;
  }

  const rawCookie = request.headers.get("cookie") ?? "";
  return rawCookie.split(";").some((part) => {
    const [name, ...valueParts] = part.trim().split("=");
    return name !== undefined
      && cookieNameCandidates.includes(name)
      && readCookieValue(valueParts.join("=")) === headerToken;
  });
}

export function createPlaneProxy(options: PlaneProxyOptions): PlaneProxyHandler {
  const { plane, isPublicPath, isForbiddenPath, locale, hostGuard } = options;
  const supportedLocales = new Set<string>(locale.locales);

  return function proxy(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);
    requestHeaders.set("x-plane", plane.key);
    requestHeaders.set("x-search", request.nextUrl.search);

    const guard = decideHostGuard({
      host: request.headers.get("host"),
      allowedHosts: hostGuard.allowedHosts,
      allowDirectAccess: hostGuard.allowDirectAccess,
    });
    if (guard.action === "reject") {
      if (pathname.startsWith("/api/") || request.headers.get("accept")?.includes("application/json")) {
        return NextResponse.json({ error: "INVALID_HOST", plane: plane.key }, { status: 421 });
      }
      if (hostGuard.gatewayOrigin) {
        return NextResponse.redirect(new URL(pathname + request.nextUrl.search, hostGuard.gatewayOrigin));
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
      if (!hasMatchingCsrfCookie(request, cookieNamesWithHostPrefix(plane.csrfCookieName), csrfHeader)) {
        return NextResponse.json({ error: "CSRF_VALIDATION_FAILED", plane: plane.key }, { status: 403 });
      }
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    const sessionCookie = readCookieWithHostPrefix(
      plane.cookieName,
      (cookieName) => request.cookies.get(cookieName),
    );
    if (!sessionCookie) {
      const loginUrl = new URL(plane.loginPath, request.url);
      const originalPath = pathname + request.nextUrl.search;
      if (originalPath !== "/") loginUrl.searchParams.set("returnUrl", originalPath);
      return NextResponse.redirect(loginUrl);
    }

    const mfaPending = readCookieWithHostPrefix(
      plane.mfaPendingCookieName,
      (cookieName) => request.cookies.get(cookieName)?.value,
    );
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
      const acceptLanguage = request.headers.get("accept-language") ?? "";
      const preferred = acceptLanguage
        .split(",")
        .map((part) => (part.split(";")[0] ?? "").trim().split("-")[0]?.toLowerCase() ?? "")
        .find((language) => supportedLocales.has(language));

      const response = NextResponse.next({ request: { headers: requestHeaders } });
      response.cookies.set(plane.localeCookieName, preferred ?? locale.defaultLocale, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
      });
      return response;
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  };
}
