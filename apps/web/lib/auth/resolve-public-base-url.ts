import "server-only";

/**
 * Derives the public-facing base URL from the incoming request.
 *
 * Traefik terminates TLS and forwards the original scheme via
 * X-Forwarded-Proto, so we trust that header to reconstruct the
 * correct HTTPS origin for KC callback/logout redirect URIs.
 *
 * PUBLIC_WEB_URL is preferred for local dev because the shared stack .env uses
 * PUBLIC_BASE_URL for the API origin. PUBLIC_BASE_URL remains the container
 * override for deployments where Host may reflect an internal service name.
 */
export function resolvePublicBaseUrl(req: Request): string {
  const configuredBaseUrl = process.env.PUBLIC_WEB_URL ?? process.env.PUBLIC_BASE_URL;
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, "");
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
