import "server-only";

/**
 * Derives the public-facing base URL from the incoming request.
 *
 * Traefik terminates TLS and forwards the original scheme via
 * X-Forwarded-Proto, so we trust that header to reconstruct the
 * correct HTTPS origin for KC callback/logout redirect URIs.
 *
 * PUBLIC_BASE_URL overrides everything — use it in containerised
 * deployments where the Host header reflects an internal service name.
 */
export function resolvePublicBaseUrl(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
