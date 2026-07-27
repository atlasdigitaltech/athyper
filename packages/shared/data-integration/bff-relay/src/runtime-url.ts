/**
 * Canonical runtime API origin.
 *
 * Runtime paths own their mountpoint (usually `/api`). Tolerating a base URL
 * copied with a terminal `/api` avoids accidental `/api/api/...` requests
 * without changing the meaning of paths such as `/runtime/v1/...`.
 */
export function normalizeRuntimeApiUrl(value: string): string {
  const withoutTrailingSlash = value.replace(/\/+$/, "");
  return withoutTrailingSlash.replace(/\/api$/i, "");
}

export function buildRuntimeApiUrl(baseUrl: string, pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${normalizeRuntimeApiUrl(baseUrl)}${normalizedPath}`;
}
