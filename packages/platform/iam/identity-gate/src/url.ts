import type { PlaneConfig, RealmKey } from "@athyper/platform-iam-session-plane";
import type { WorkbenchFilter } from "./workbench";

const AUTH_SELECT_PATH = "/auth/select";

// Block auth-flow and API paths as redirect targets. Without these guards a
// successful login could bounce the user back into the auth flow (open redirect
// loop) or directly call an API route, which would bypass CSRF checks that
// expect browser-initiated navigations.
export function sanitizeFinalDestination(
  value: string | null | undefined,
  fallback: string,
): string {
  const path = normalizeRelativePath(value);
  if (!path) return fallback;
  if (
    path === "/login" ||
    path.startsWith("/login?") ||
    path === "/logout" ||
    path.startsWith("/logout?") ||
    path === "/auth" ||
    path.startsWith("/auth/") ||
    path.startsWith("/auth?") ||
    path === "/mfa" ||
    path.startsWith("/mfa/") ||
    path.startsWith("/mfa?") ||
    path === "/api" ||
    path.startsWith("/api/")
  ) {
    return fallback;
  }
  return path;
}

export function sanitizeAuthFlowContinuation(
  value: string | null | undefined,
  fallback = AUTH_SELECT_PATH,
): string {
  const path = normalizeRelativePath(value);
  if (!path) return fallback;
  if (path === AUTH_SELECT_PATH) return path;
  if (!path.startsWith(`${AUTH_SELECT_PATH}?`)) return fallback;

  const params = new URLSearchParams(path.slice(path.indexOf("?") + 1));
  const nested = params.get("returnUrl");
  const safeNested = sanitizeFinalDestination(nested, "");
  if (!safeNested) return fallback;
  const filter = params.get("filter");
  return buildSelectContinuation(safeNested, toWorkbenchFilter(filter));
}

export function buildSelectContinuation(
  finalDestination: string,
  filter?: WorkbenchFilter | null,
): string {
  const params = new URLSearchParams();
  params.set("returnUrl", finalDestination);
  if (filter) params.set("filter", filter);
  return `${AUTH_SELECT_PATH}?${params.toString()}`;
}

export function buildLoginHref(args: {
  config: PlaneConfig;
  realm: RealmKey;
  finalDestination: string;
  filter?: WorkbenchFilter | null;
  provider?: string | null;
  force?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("realm", args.realm);
  params.set("returnUrl", buildSelectContinuation(args.finalDestination, args.filter));
  if (args.provider) params.set("provider", args.provider);
  if (args.force) params.set("force", "1");
  return `/api/auth/login?${params.toString()}`;
}

export function currentPathWithSearch(snapshot: {
  pathname: string;
  search: string;
}): string {
  return `${snapshot.pathname}${snapshot.search}`;
}

export function readFinalDestinationFromSearch(
  search: string,
  fallback: string,
): string {
  const params = new URLSearchParams(search);
  return sanitizeFinalDestination(
    params.get("redirect") ?? params.get("returnUrl"),
    fallback,
  );
}

// Resolves a user-supplied path to a canonical relative URL, or returns null
// if the value looks like an absolute URL or is otherwise unsafe.
// Using a throwaway base URL (athyper.invalid) lets the URL constructor parse
// the path; checking that the origin didn't change confirms no host was embedded
// (e.g. "//evil.com/path" resolves to a different origin and is rejected).
function normalizeRelativePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("//")) {
    return null;
  }

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  try {
    const parsed = new URL(path, "https://athyper.invalid");
    if (parsed.origin !== "https://athyper.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function toWorkbenchFilter(value: string | null): WorkbenchFilter | null {
  return value === "user" || value === "partner" || value === "admin" ? value : null;
}
